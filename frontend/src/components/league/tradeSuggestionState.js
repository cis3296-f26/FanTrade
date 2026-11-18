// Keys include every choice that affects a result, so an old response cannot match a new selection.
export function selectionKey(request, partnerId) {
  return JSON.stringify({ ...request, partner_roster_id: String(partnerId) });
}

export function mergePartnerPage(previous, incoming) {
  const oldById = new Map(previous.map((partner) => [String(partner.roster_id), partner]));
  // The API returns the full ranking, but only verifies one page at a time.
  return incoming.map((partner) => {
    const old = oldById.get(String(partner.roster_id));
    return partner.verification_status === "not_checked" && old ? old : partner;
  });
}

export function matchingPreview(partner, request) {
  const result = partner?.suggestion_result;
  const preferences = result?.preferences;
  const target = result?.suggestion?.target_position;
  const matchesPosition = request.position === "ANY" || request.position === target ||
    (request.position === "FLEX" && ["RB", "WR", "TE"].includes(target));
  if (partner?.verification_status !== "ready" || result?.status !== "ok" || !matchesPosition ||
      preferences?.min_gain_percent !== request.min_gain_percent ||
      preferences?.max_gain_percent !== request.max_gain_percent ||
      preferences?.trade_style !== request.trade_style) return null;
  return result;
}
