#!/usr/bin/env python3
"""Mock Modbus TCP device that serves coffee roaster telemetry registers.

Simulates a coffee roaster exposing telemetry via Modbus TCP input registers
and accepting control commands via holding registers. Register layout matches
the rustRoast Standard preset.

Input Registers (FC 04, read-only):
  0x0000-0x0001  bean_temp      float32  (IEEE 754 big-endian)
  0x0002-0x0003  env_temp       float32
  0x0004-0x0005  rate_of_rise   float32
  0x0006         heater_pwm     uint16   (0-100)
  0x0007         fan_pwm        uint16   (0-255)

Holding Registers (FC 03/06/16, read-write):
  0x0000-0x0001  setpoint       float32
  0x0002         fan_pwm_set    uint16
  0x0003         heater_pwm_set uint16
  0x0004         control_mode   uint16   (0=manual, 1=auto)
  0x0005         heater_enable  uint16   (0=off, 1=on)
  0x000C         emergency_stop uint16   (write 1 to trigger)

Usage:
  python mock_modbus_device.py
  MODBUS_HOST=0.0.0.0 MODBUS_PORT=5020 python mock_modbus_device.py
"""

import math
import os
import random
import struct
import threading
import time

from pymodbus.server import StartTcpServer
from pymodbus.datastore import (
    ModbusSequentialDataBlock,
    ModbusDeviceContext,
    ModbusServerContext,
)
from pymodbus.server.server import ModbusDeviceIdentification

HOST = os.environ.get("MODBUS_HOST", "0.0.0.0")
PORT = int(os.environ.get("MODBUS_PORT", "5020"))
UNIT_ID = int(os.environ.get("MODBUS_UNIT_ID", "1"))
UPDATE_HZ = float(os.environ.get("UPDATE_HZ", "1"))

# --- Roast simulation ---

ROAST_PROFILES = [
    {"name": "Light", "duration": 600, "fc_temp": 196, "drop_temp": 205},
    {"name": "Medium", "duration": 720, "fc_temp": 200, "drop_temp": 215},
    {"name": "Dark", "duration": 900, "fc_temp": 200, "drop_temp": 230},
]


def float_to_regs(value: float) -> tuple[int, int]:
    """Convert a float to two 16-bit registers (IEEE 754, big-endian ABCD)."""
    packed = struct.pack(">f", value)
    hi = (packed[0] << 8) | packed[1]
    lo = (packed[2] << 8) | packed[3]
    return hi, lo


class RoastSimulator:
    """Cycles through roast profiles generating realistic temperature curves."""

    def __init__(self):
        self.profile_idx = 0
        self.roast_start = time.time()
        self.prev_bean_temp = 22.0
        self.bean_temp = 22.0
        self.env_temp = 37.0
        self.ror = 0.0
        self.heater_pwm = 0
        self.fan_pwm = 180
        self.setpoint = 200.0
        self.control_mode = 1  # auto
        self.heater_enable = 1

    def current_profile(self):
        return ROAST_PROFILES[self.profile_idx % len(ROAST_PROFILES)]

    def tick(self):
        profile = self.current_profile()
        elapsed = time.time() - self.roast_start
        fraction = min(elapsed / profile["duration"], 1.0)

        # Ambient -> drop temp sigmoid curve
        ambient = 22.0
        target = profile["drop_temp"]
        sigmoid = 1.0 / (1.0 + math.exp(-12 * (fraction - 0.35)))
        ideal_temp = ambient + (target - ambient) * sigmoid

        # Add realistic noise
        noise = random.gauss(0, 0.3)
        self.prev_bean_temp = self.bean_temp
        self.bean_temp = ideal_temp + noise
        self.env_temp = self.bean_temp + 15 + random.gauss(0, 0.5)

        # Rate of rise (degrees per minute)
        dt = 1.0 / max(UPDATE_HZ, 0.1)
        self.ror = (self.bean_temp - self.prev_bean_temp) / dt * 60.0

        # Heater follows a bell curve peaking mid-roast
        self.heater_pwm = int(100 * math.exp(-((fraction - 0.4) ** 2) / 0.08))
        self.heater_pwm = max(0, min(100, self.heater_pwm))

        # Fan ramps up during roast
        self.fan_pwm = int(120 + 135 * fraction)
        self.fan_pwm = max(0, min(255, self.fan_pwm))

        # Cycle to next roast after completion + cooldown
        if elapsed > profile["duration"] + 30:
            self.profile_idx += 1
            self.roast_start = time.time()
            self.bean_temp = 22.0
            self.prev_bean_temp = 22.0
            print(f"[modbus-mock] Starting roast: {self.current_profile()['name']}")


def update_registers(context: ModbusServerContext, sim: RoastSimulator):
    """Background thread that updates Modbus registers from the simulator."""
    print(f"[modbus-mock] Register updater running at {UPDATE_HZ} Hz")
    print(f"[modbus-mock] Starting roast: {sim.current_profile()['name']}")

    while True:
        sim.tick()

        slave = context[UNIT_ID]

        # Update input registers (FC 04, address block ir)
        bt_hi, bt_lo = float_to_regs(sim.bean_temp)
        et_hi, et_lo = float_to_regs(sim.env_temp)
        ror_hi, ror_lo = float_to_regs(sim.ror)

        # pymodbus uses 1-based addressing internally for setValues
        slave.setValues(4, 0, [bt_hi, bt_lo, et_hi, et_lo, ror_hi, ror_lo,
                                sim.heater_pwm, sim.fan_pwm])

        # Update holding registers with current control state
        sp_hi, sp_lo = float_to_regs(sim.setpoint)
        slave.setValues(3, 0, [sp_hi, sp_lo, sim.fan_pwm, sim.heater_pwm,
                                sim.control_mode, sim.heater_enable])

        time.sleep(1.0 / UPDATE_HZ)


def main():
    print(f"[modbus-mock] Coffee roaster Modbus TCP simulator")
    print(f"[modbus-mock] Listening on {HOST}:{PORT} (unit ID {UNIT_ID})")

    # Create data blocks: input registers and holding registers
    # 20 registers each is plenty for the rustRoast register map
    ir_block = ModbusSequentialDataBlock(0, [0] * 20)
    hr_block = ModbusSequentialDataBlock(0, [0] * 20)

    slave = ModbusDeviceContext(
        di=ModbusSequentialDataBlock(0, [0] * 10),  # discrete inputs (unused)
        co=ModbusSequentialDataBlock(0, [0] * 10),  # coils (unused)
        ir=ir_block,
        hr=hr_block,
    )

    context = ModbusServerContext(devices={UNIT_ID: slave}, single=False)

    # Device identification
    identity = ModbusDeviceIdentification()
    identity.VendorName = "rustRoast"
    identity.ProductCode = "MOCK-MODBUS"
    identity.ProductName = "Mock Coffee Roaster (Modbus TCP)"
    identity.ModelName = "MockRoaster-v1"

    # Start simulator in background
    sim = RoastSimulator()
    updater = threading.Thread(target=update_registers, args=(context, sim), daemon=True)
    updater.start()

    # Start Modbus TCP server (blocks)
    StartTcpServer(
        context=context,
        identity=identity,
        address=(HOST, PORT),
    )


if __name__ == "__main__":
    main()
