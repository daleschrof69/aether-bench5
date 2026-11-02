/** Every operation is free. Prices here are kept only so older labels still resolve to zero. */

export const OP_COSTS = {
  universal_unlock: [25],
  bypass_frp: [0, 20],
  remove_screen_lock: [8, 10],
  repair_imei: [5],
  unlock_bootloader: [10],
  mi_account_bypass: [20],
  mdm_bypass: [18],
  read_codes: [8],
  read_frp_token: [3],
  boot_repair: [10],
  edl_auth_unlock: [20],
  cert_repair: [15],
  knox_suspend: [15],
  carrier_unlock: [12],
  demo_unit_disable: [4],
  safe_format: [5],
  apple_info: [20],
  icloud_check: [5],
  hello_screen_bypass: [35],
  sim_unlock: [25],
  passcode_recover: [30],
  trust_audit: [10],
  samsung_mdm_remove: [25],
  samsung_factory_reset: [15],
};

export function creditsFromLabel(cost) {
  if (cost == null || /^free$/i.test(String(cost).trim())) return 0;
  const amount = parseInt(String(cost), 10);
  return Number.isFinite(amount) ? amount : 0;
}

export function quoteOp() {
  return 0;
}
