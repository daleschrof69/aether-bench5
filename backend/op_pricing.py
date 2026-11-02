"""Operation prices. Every function is free."""

OP_COSTS = {
    "universal_unlock": (25,),
    "bypass_frp": (0, 20),
    "remove_screen_lock": (8, 10),
    "repair_imei": (5,),
    "unlock_bootloader": (10,),
    "mi_account_bypass": (20,),
    "mdm_bypass": (18,),
    "read_codes": (8,),
    "read_frp_token": (3,),
    "boot_repair": (10,),
    "edl_auth_unlock": (20,),
    "cert_repair": (15,),
    "knox_suspend": (15,),
    "carrier_unlock": (12,),
    "demo_unit_disable": (4,),
    "safe_format": (5,),
    "apple_info": (20,),
    "icloud_check": (5,),
    "hello_screen_bypass": (35,),
    "sim_unlock": (25,),
    "passcode_recover": (30,),
    "trust_audit": (10,),
    "samsung_mdm_remove": (25,),
    "samsung_factory_reset": (15,),
}


def quote_op(action_key: str, cost: int) -> int:
    """Every operation is free, including ones that used to have a price."""
    if cost < 0:
        raise ValueError("credit price cannot be negative")
    _ = OP_COSTS.get(action_key)
    return 0
