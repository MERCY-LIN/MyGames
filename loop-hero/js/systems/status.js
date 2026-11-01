// 通用状态容器：挂在“被施加者”身上（英雄或敌人），由 combat 按帧结算
export function applyStatus(target, status) {
  if (!target.status) target.status = [];
  const same = target.status.find((s) => s.kind === status.kind);
  if (same) {
    same.power = Math.max(same.power, status.power);
    same.ttl = Math.max(same.ttl, status.ttl);
    return same;
  }
  const inst = { ...status };
  target.status.push(inst);
  return inst;
}

export function tickStatusList(target, dt) {
  const list = target.status || [];
  let changed = false;
  for (const st of list) {
    st.ttl -= dt;
    if (st.ttl <= 0) changed = true;
  }
  if (changed) target.status = list.filter((st) => st.ttl > 0);
  return list.filter((st) => st.ttl > 0);
}
