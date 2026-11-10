"""Aether emulator entry point.

Deterministic, hardware-free session using only synthetic device information.
Safe to run on any machine with no physical USB attached.
"""
import argparse
import json


def emulate() -> dict:
    """Return a deterministic session using only synthetic device information."""
    events = [
        {"event": "emulation.started", "message": "Emulation is enabled; hardware access remains off."},
        {
            "event": "device.discovered",
            "device": {
                "id": "SIM-USB-001",
                "transport": "virtual",
                "vendor": "Demo Vendor",
                "product": "Safe Demo Device",
                "mode": "normal",
            },
        },
        {
            "event": "inventory.read",
            "result": {
                "serial": "SIMULATED-0001",
                "firmware": "0.0-sim",
                "source": "synthetic fixture",
            },
        },
        {
            "event": "preflight.completed",
            "read_only": ["synthetic inventory"],
            "enabled": ["synthetic inventory emulation"],
        },
        {
            "event": "exploit.simulated",
            "exploit": "CVE-2025-20435",
            "message": "MediaTek SoC chipset exploit simulated",
        },
        {
            "event": "exploit.simulated",
            "exploit": "CVE-2024-45569",
            "message": "Qualcomm WLAN component exploit simulated",
        },
        {
            "event": "exploit.simulated",
            "exploit": "CVE-2024-53104",
            "message": "Linux kernel UVC driver exploit simulated",
        },
        {
            "event": "exploit.simulated",
            "exploit": "CVE-2025-27363",
            "message": "System component local code execution exploit simulated",
        },
        {"event": "emulation.completed", "device_operations_run": 0},
    ]
    return {
        "mode": "emulation",
        "emulation_enabled": True,
        "hardware_accessed": False,
        "events": events,
    }


def exploit_device(device_id, exploit_type):
    """Simulate exploiting a device based on the specified exploit type."""
    exploits = {
        "CVE-2025-20435": "MediaTek SoC chipset exploit",
        "CVE-2024-45569": "Qualcomm WLAN component exploit",
        "CVE-2024-53104": "Linux kernel UVC driver exploit",
        "CVE-2025-27363": "System component local code execution exploit",
    }
    if exploit_type in exploits:
        print(f"Exploiting device {device_id} with {exploits[exploit_type]}")
    else:
        print(f"Unknown exploit type: {exploit_type}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Aether's hardware-free emulation.")
    parser.add_argument("--json", action="store_true", help="print the session as JSON")
    parser.add_argument("--exploit", type=str, help="Exploit the device with a specific vulnerability")
    args = parser.parse_args()

    result = emulate()
    if args.json:
        print(json.dumps(result, indent=2))
        return

    print("Aether Emulator — hardware-free emulation")
    for event in result["events"]:
        print(f"- {event['event']}: {json.dumps(event, sort_keys=True)}")
    if args.exploit:
        exploit_device(result["device"]["id"], args.exploit)
    print("No physical device was accessed; no device operations were run.")


if __name__ == "__main__":
    main()
