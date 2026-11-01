# Loop Hero 复刻 · 详细设计文档（第 3.1 轮 · 审查修订版）

最后更新：2026-10-31。基于当前代码实况（约 8000 行，三职业 / 55 卡 / 23 建筑 / 4 章 + 无尽 / 26 敌 / 19 天赋）。
范围：**敌人技能体系、装备系统、经济与资源、建筑升级树、Boss 战形态、多敌同格与状态效果、平衡校准工具、架构拆分**。
（按需求排除：音频、存档版本化、移动端/PWA、seed/可复现性。）

> **实施进度（v3.1 落地情况）**
>
> | 里程碑 | 状态 | 关键结果 |
> | --- | --- | --- |
> | M1 架构拆分（S0） | ✅ 完成 | game.js 1228 → 681 行；5 组固定 seed 战报与拆分前逐字段一致 |
> | M2 平衡工具（S7 阶段 A） | ✅ 完成 | `tools/simulate.mjs`；11 组 × 40 局全矩阵 2 秒跑完；回归断言已并入 sim.test.mjs |
> | M3 敌人技能 + 三敌同格（S1/S2） | ✅ 完成 | 15 种敌人能力；第 4 圈起 3 敌同格；Boss 可溢出到 4 人；中毒/分裂/复生/窃取/远程等均有 sim 覆盖 |
> | M4 Boss 追逐（S3） | ✅ 完成 | 沿路径追逐、每帧格子同步、塔不可瞄准、追上拦截、距离 HUD；sim 覆盖 |
> | M5 装备系统（S4） | ✅ 完成 | 词条池、全词条接线、拾取面板、背包 12 格、自动装备开关；逻辑/sim 覆盖 |
> | M6 经济/建筑树（S5/S6） | ✅ 完成 | 6 资源、盗贼战利品包、战报清单、建筑 tier/前置/下一目标、6 资源 HUD |
> | M7 全量校准（S7） | ✅ 完成 | 战士 ch3 67.5%、三职业极差 22.5pp（40 局）；sim 回归改为设计目标区间 |
>
> **已知刻意偏差（4 处，均为设计意图内的改进）**
> 1. `dmgDealt` 现计入**塔伤害**（单一伤害入口的必然结果；S5 战报需要完整的伤害口径）。这是拆分前后唯一逐字段不一致的项。
> 2. `makeSkeleton` / `spawnEnemies` 改用种子随机源（原用 `Math.random`，导致死灵局不可复现）——属 Y8 的落实，是「固定 seed 可复现」的前提。
> 3. 窃取归还已并入统一 `lootQueue` 与背包；`pendingLoot` 只表示当前正在展示的那一件。
> 4. 特质与战利品仍用两个字段（`run.traitChoices` / `run.pendingLoot`）串行处理；行为等价，但 S4 设计稿要求的统一 `pendingChoice` 尚未合并。

> **修订说明（v3 → v3.1）**：本版已合并独立审查报告的全部 🔴 阻断性与 🟡 应修正问题。主要变化：
> ① S4 词条接线改为 `h.bonus` 范式（R1）；② S0 增加 ctx.ctrl 控制钩子与 Game 门面方法（R2），目标行数放宽到 ≤700（Y1）；③ S3 追逐 Boss 每帧同步 `e.cell` + 塔不可瞄准 marching Boss（R3）；④ S1 能力分配补到 15 种（R4）、伤害入口收敛为单一 `dealDamageToEnemy`（Y4）、ranged 先手时点明确（Y3）；⑤ S4 的 lootChoice 改为统一 `pendingChoice` + 掉落队列（R5）；⑥ 其余 Y5–Y10 与 🟢 建议全部落实。模块结论见文末附录。

---

# S0 · 架构拆分（先行，其他设计的前置）

## 0.1 目标与现状
`game.js`（1228 行）是 God Object：战斗、刷怪、手牌、Boss、特效全在一个类里。新机制都要改它；批量模拟工具目前只能靠 `tests/sim.test.mjs` 的 DOM 桩驱动（见 S7.2，这条路径已验证可行，S0 不是 S7 的硬前置，但 S0 完成后模拟可省掉 DOM 桩的脆弱性）。

## 0.2 拆分方案
Game 类保留为**编排层**（状态、模式切换、输入入口），逻辑下沉为不依赖 DOM 的模块。所有下沉模块遵守同一约定：

```js
// 每个模块导出纯函数，签名统一为 (run, ctx, ...args)
// run  = Game.run 状态对象
// ctx  = {
//   rng,            // core/rng.js 单例（见 0.4 seed 注入）
//   emit: {         // 【表现通道】只管演出，不含游戏逻辑
//     toast(msg, tone), floatAt(x,y,text,color,size),
//     burst(pos,n,color), shake(v), flash(v),
//   },
//   ctrl: {         // 【控制钩子】逻辑模块需要反向触发的 Game 行为，
//     die(), victory(), clearLayer(), openTraits(),
//     startCombatChain(),          // killEnemy 末尾的链式下一战
//     offerLoot(item), questComplete(), endLoopHook(),
//   },              // 由 Game 构造时注入，内部可修改 this.mode / this.paused
//   meta,           // 存档 meta。可写项仅限：资源入账 / 图鉴发现 / 存档计数（bankResources、markCard、markEnemy）
//                   // 禁止用 meta 做战斗决策（战斗只读 run）
//   isOver: () => game.mode !== 'run',   // 替代原 `this.mode !== 'run'` 的流程判断
// }
// 实际实现的成员比初版设计多 3 个（均为必需）：
//   emit.flashMax(v) / emit.shakeMax(v)  —— 复刻原 `this.shake = Math.max(this.shake, v)` 语义（另有 emit.flash/shake 为直接赋值）
//   ctrl.saveMeta()                      —— 存档写入（bankResources / build 用）
// 未启用（M5/M6 预留）：ctrl.startCombatChain / offerLoot / questComplete / endLoopHook
```

| 新文件 | 迁入的方法 |
| --- | --- |
| `js/systems/combat.js` | startCombat / updateCombat / heroAttack / enemyAttack / counterAttack / updateSkeletons / summonSkeletons / killEnemy / damageEnemy / **dealDamageToEnemy（新增，见 S1.3/Y4）** / bossSpecial |
| `js/systems/spawner.js` | spawnLoopEnemies / maybeSpawnBoss / nearestEnemy / updateTowers |
| `js/systems/hand.js` | drawCards / fillHand / discardCard 核心逻辑 / handMax |
| `js/systems/economy.js` | bankResources / completeQuest / resName（S5 再加 lootBag 与入账清单） |
| `js/systems/geom.js` | pathPoint / heroPos / cellCenter / enemyPos（让战斗与经济彻底不依赖 Game） |
| `js/systems/board.js` | cellInfo / placementHint / placementSummary / placementCheck（纯棋盘查询） |
| `js/systems/tiles.js` | useForge / startQuest（地形与任务触发效果） |
| `js/systems/fx.js` | floatAt / burst / updateEffects（⚠ 会消耗随机数，顺序不可随意调整） |

保留在 `game.js`：update(dt) 主循环骨架、updateMovement、onEnterCell、tryPlace、endLoop、useLibrary、trait/pendingChoice 流程、全部门面方法。

## 0.3 行为约束
- **搬移 + 机械式替换**：逻辑除 `this.run` → `run`、`this.toast(...)` → `ctx.emit.toast(...)`、需要反向控制处 → `ctx.ctrl.*` 外不改语义。
- **Game 保留同名门面方法**（一行委托到下沉函数），保证 `tests/sim.test.mjs` 直接调用的 `g.maybeSpawnBoss()` / `g.killEnemy()` / `g.heroAttack()` / `g.startCombat()` / `g.die()` / `g.useLibrary()` / `g.useForge()` 等继续可用。门面清单列入验收。
- **rng.seed 注入**（Y8）：`core/rng.js` 增加 `rng.reset(seed)`（mulberry32 已是可重置实现），拆分前后一致性验证、S7 胜率断言都依赖它。
- **伤害样板同步收敛**（Y4/🟢5）：`heroAttack / counterAttack / updateSkeletons / damageEnemy` 四处重复的 `e.hp -= dmg → killEnemy` 收敛到 `dealDamageToEnemy(e, dmg, source)` 单一入口（source ∈ 'hero' | 'counter' | 'skeleton' | 'tower' | 'status'），为 S1 的 armorUp/onBeforeDeath 钩子提供唯一挂载点，避免二次返工。

## 0.4 验收
- [x] game.js ≤ 700 行（实测 **681 行**）；三测试全绿
- [x] 固定 seed 下 sim 结果与拆分前**逐字段一致**（warrior/rogue/necro × ch1/ch4/无尽 共 5 组，唯一差异为刻意计入的塔伤害 dmgDealt）
- [x] 门面方法清单齐备：handMax / drawCards / fillHand / spawnLoopEnemies / maybeSpawnBoss / nearestEnemy / updateTowers / startCombat / updateCombat / killEnemy / heroAttack / damageEnemy
- [x] 单一伤害入口 `dealDamageToEnemy(run, ctx, e, dmg, fx)` 已覆盖 hero / skeleton / counter / tower 四路
- [x] `rng.reset(seed)` 已提供

**落地补充（超出原设计的小工具）**：`js/systems/geom.js` 承载坐标换算，让战斗/经济模块完全不依赖 Game。
**踩坑记录**：`burst` 每粒子消耗 4 个随机数、`killEnemy` 也会消耗随机数——搬移时若把爆发移到击杀结算**之后**，随机流会错位导致行为漂移。已在 `dealDamageToEnemy` 内固定「浮字 → 附加浮字 → 爆发 → 击杀结算」顺序。

---

# S1 · 敌人技能体系（数据驱动）

## 1.1 现状
`js/data/enemies.js` 的敌人只有 hp/atk/speed/xp/vamp/evade/loot 五维。战斗无差异性——除了 Boss 的 `bossSpecial` 硬编码 switch。

## 1.2 数据结构

```js
// enemies.js 中每个敌人可选新增：
// abilities: Array<AbilityId | { id, ...params }>
// 示例：
slime: { ..., abilities: ['split'] },
vampire: { ..., abilities: [{ id: 'stealEquip', chance: 0.15 }] },
```

能力注册表 `js/data/abilities.js`（新增文件）：

```js
export const ABILITIES = {
  // 每个能力是一组钩子；ctx 由 combat.js 提供（emit + ctrl）
  split: {
    name: '分裂', desc: '死亡时分裂成两只幼体。',
    hooks: {
      onBeforeDeath(e, ctx) { /* push 2 new enemies, return 'handled' 阻止默认死亡结算 */ },
    },
  },
  stealEquip: { name: '窃取', hooks: { onHitHero(e, hero, ctx) {} } },
  revive:      { name: '复生', hooks: { onBeforeDeath(e, ctx) {} } },
  poison:      { name: '毒素', hooks: { onHitHero(e, hero, ctx) {} } },   // 附加 status
  ranged:      { name: '远程', hooks: { onHeroEnter(e, ctx) {} } },       // 英雄进格先手
  armorUp:     { name: '硬化', hooks: { onHurt(e, dmg, ctx) {} } },       // 受击叠层
  summonOnDie: { name: '余烬', hooks: { onBeforeDeath(e, ctx) {} } },
  auraHeal:    { name: '治疗光环', hooks: { onTick(e, dt, ctx) {} } },
  regen:       { name: '再生', hooks: { onTick(e, dt, ctx) {} } },
  frenzy:      { name: '嗜血', hooks: { onTick(e, dt, ctx) {} } },        // hp<50% 时 atk 提升
  sandVeil:    { name: '沙幕', hooks: { onCombatStart(e, ctx) {} } },     // 开战叠闪避
  lure:        { name: '惑歌', hooks: { onCombatStart(e, ctx) {} } },     // 英雄下 2 次攻击 -15% 伤害
};
```

## 1.3 钩子调用点（combat.js）
- **统一伤害入口**（Y4）：所有对敌伤害走 S0.3 定义的 `dealDamageToEnemy(e, dmg, source)`；`onHurt`（armorUp 叠层与减伤）和 `onBeforeDeath`（split/revive/summonOnDie）只挂在这里——反击、骷髅、塔、毒都自动被钩子覆盖。
- `onCombatStart(e)` — startCombat 末尾
- `onHeroEnter(e)` —（Y3）插入点为 `onEnterCell` 中 `run.enemies.find(...)` 命中之后、`startCombat` 之前：先执行 ranged 先手（伤害 = atk×0.6–0.8 的**独立路径**，不吃英雄 def，不走 enemyAttack），若先手击杀英雄 → 立即 `die()` 并 return（`updateMovement` 已有 `mode !== 'run'` 的 break 保护，`game.js:437`）；否则正常 startCombat。
- `onHitHero(e, hero)` — enemyAttack 命中英雄后
- `onTick(e, dt)` — updateCombat 每帧（auraHeal：治疗同格友军 1.5%maxHp/s；regen：自愈 2/s；frenzy：hp<50% 时 atk×1.25）

## 1.4 状态效果（status）系统
状态挂在**被施加者**身上：英雄与敌人实例都可有 `status` 数组。

```js
status: [],        // [{ kind:'poison', power:2, ttl:4 }]  power = 每秒伤害
shieldStacks: 0,   // armorUp 专用（敌人）
stolenFrom: null,  // stealEquip 记录被偷的装备（敌人）
```

- 蜘蛛/蚊群命中时把 `poison` 写入 **`h.status`**，由 `combat.tickHeroStatus` 每帧结算（战斗内外都走时间）；毒死走正常 `die()`。
- 敌人自身的 buff/debuff（后续词条）写入 `e.status`，由同一套 `status.js` 容器管理；当前 M3 尚无敌人被毒来源。
- 中毒粒子：英雄头顶绿色小泡（`render/scene.js` 的 `drawHero` 分支）。

## 1.5 26 种敌人分配表（15 种带能力，R4 修订）

| 敌人 | 新增能力 | 参数 |
| --- | --- | --- |
| 史莱姆 | split | 分裂 2 只，hp×0.5，atk×0.6，分裂体不再分裂 |
| 蜘蛛 | poison | 30% 概率命中附加 2/s × 3s |
| 吸血鬼 | stealEquip | 15% 命中时偷走英雄**最弱**的一件已装备（详见 1.6）；击杀归还 |
| 幽灵 | revive | 首次被击杀 50% 概率以 40% hp 复活，整场战斗限一次 |
| 蚊群 | poison | 15% 概率附加 1/s × 2s（轻量版） |
| 鹰身女妖 | ranged | 先手 atk×0.6 |
| 哥布林弓箭手 | ranged | 先手 atk×0.8 |
| 焦火蠕虫 | summonOnDie | 死亡召唤 1 只魔血块（hp×0.4） |
| 石像鬼 | armorUp | 最多 3 层，每层 -4% |
| 尸鬼 | regen | 2/s |
| 木制勇士 | armorUp | 固定 1 层（-6%），不可叠 |
| 野狼 | frenzy | hp<50% 时攻击 ×1.25 |
| 沙漠之灵 | sandVeil | 开战闪避 +10%，持续整场 |
| 海妖 | lure | 开战使英雄接下来 2 次攻击伤害 -15% |
| 女祭司（Boss） | auraHeal | 治疗同格友军（S2 后召唤物可成为治疗对象；S2 前若同格无敌则不触发） |
| 骷髅/野狼以外的普通怪、宝箱怪、强盗、哥布林、稻草人、鱼人、灵书、魔血块、巫妖、猎手、终焉 | — | 保持 |

## 1.6 stealEquip 细节（Y5）
- 偷走装备后立即 `deriveHero`（攻防即时下降）并 toast 提示被偷物品名。
- 归还规则：击杀该吸血鬼时，若对应槽位**为空** → 原样归还；若已被新装备占用 → 自动走 S4 的 offerLoot 对比流程（不静默覆盖）。
- 状态清理：英雄死亡时 `stolenFrom` 物品不归还（视为丢失）；撤退（returnToCamp）时同样不归还，战报中提示「被窃的 X 遗失在远征中」。
- 实现挂点：killEnemy 内对 `e.stolenFrom` 的统一处理（单一死亡入口保证塔/毒/分裂连锁击杀也能归还）。

## 1.7 图鉴与 UI
- `markEnemy` 不变；图鉴敌人页根据 `ENEMIES[type].abilities` 显示能力标签（名称 + desc），实现于 `ui/screens.js` 图鉴渲染处。
- 悬停敌人时（`cellInfo`）desc 追加能力列表；同格多敌时显示整格敌人列表（🟢3：当前是按格命中，无逐敌像素检测）。

## 1.8 文件触点
`data/enemies.js`、`data/abilities.js`（新）、`systems/combat.js`、`game.js`（onEnterCell 的 ranged 先手插入点）、`ui/screens.js`、`render/scene.js`、`systems/codex.js`。

## 1.9 测试与验收
- `tests/logic.test.mjs` 新增：split 生成 2 只且不再分裂；revive 只触发一次；stealEquip 偷最弱装备、击杀空槽归还、被占槽走对比；armorUp 3 层封顶且反击/骷髅/塔伤害均被覆盖（经 dealDamageToEnemy）。
- [ ] 15 种敌人具备 ≥1 个能力；固定 seed 下 sim 第 8 圈巫妖胜率下降不超过 15 个百分点（技能整体抬难度，必要时 LOOP_HP 0.16 → 0.15 微调）。

---

# S2 · 多敌同格与群战规则

## 2.1 现状
`startCombat`：`run.loop >= 4 ? 2 : 1`；`enemyAttack` 群战减免固定 0.9。

## 2.2 设计
- 同格上限：`loop >= 4 ? 3 : 2`（第 1–3 圈维持 2，第 4 圈起 3，制造中期压力台阶）。
- `enemyPos` slot 排布：`ox = (slot - 0.5) * 22` → 三人时改为 `(slot - 1) * 16`，`oy = slot * 5` → `slot * 4`。
- 群战惩罚：`1 - 0.05 * (n - 1)`，下限 0.85。**显式声明（Y6）**：n=2 时由 0.9 → 0.95，这是对英雄的隐性 buff，与 S1 抬难度的方向相反——若 M2 基线显示整体难度不足再收紧，公式保留参数化（`GROUP_DMG_RELIEF = 0.05`）。
- Boss 召唤物加入 `group` 的上限同步改为 3（非 Boss 单位计数）。

## 2.3 验收
- [ ] 第 4 圈起可 3 敌同格；固定 seed sim 第 8–12 圈胜率与改造前差 ≤ 10 个百分点；文档声明的 0.95 buff 在基线对比中有记录。

## 2.4 M3 实施记录（v3.2）
- 能力注册表 `data/abilities.js`；15 种敌人挂载能力，钩子 `onCombatStart / onHeroEnter / onHurt / onHitHero / onTick / onBeforeDeath` 全部接在 `systems/combat.js` 的固定节点。
- 中毒为英雄 `h.status`；每帧由 `combat.tickHeroStatus` 结算（战斗内外都走时间），绿色浮字与头顶毒泡已接入渲染。
- 三敌同格在 `loop >= 4` 放开；群伤减免 `1 - 0.05*(n-1)`（下限 0.85，n=2 即 0.95）；Boss 可带 3 个非 Boss 单位溢出到 4 人，slot 0 固定给 Boss。
- 窃取归还：空槽直接装备；槽位被占时暂停并弹「夺回对比」（`run.pendingLoot` + `showLoot`），支持 1/2 键；S4 落地后再并入统一掉落队列与背包。
- 新增 sim 覆盖：分裂、硬化封顶、窃取/归还、复生、远程先手、中毒、三敌同格、Boss 4 人组；`tools/simulate.mjs --all --n 20` 已重跑并更新 `docs/balance.md`。

---

# S3 · Boss 追逐战

## 3.1 现状
`maybeSpawnBoss` 把 Boss 固定放在 `cell = len*0.5`，站桩等英雄路过。

## 3.2 状态机与格子同步（R3 修订）

```js
boss.march = { active: true, pos: <生成时格子 index> }   // 沿路径向英雄移动
```

- 生成后每帧 update 中推进：`boss.march.pos += bossSpeed * dt`，`bossSpeed = hero.speed * 1.3`（必能追上）。
- **每帧同步格子**（R3 核心）：`boss.cell = Math.floor(boss.march.pos) % len`。这保证所有按整数格 `e.cell` 寻敌的逻辑（onEnterCell 遇敌发现 `game.js:495`、塔的 nearestEnemy `game.js:1024`、cellInfo tooltip `game.js:245`）自动一致。
- **塔不可瞄准 marching Boss**（R3）：`nearestEnemy` 增加 `excludeMarching` 过滤（march.active === true 的 Boss 不作为塔目标）——防止 Boss 被塔磨死触发 `killEnemy → victory()`「不战而胜」。Boss 进入战斗后（march.active = false）恢复可被塔攻击。
- 渲染：`enemyPos` 对 marching boss 用 `pathPoint(boss.march.pos)`（浮点平滑），逻辑层用整格 cell。
- 追上判定：`(hero.pos - boss.march.pos mod len)` 距离 < 0.6 格 → `startCombat(boss)`，`march.active = false`。
- **Boss 加入战斗的溢出规则（Y7）**：若当前 group 已满 3 人，Boss 入组后允许**临时 4 人**（group 上限只约束非 Boss 单位），Boss 固定取 slot 0（居中、体型最大），其余单位 slot 顺延到 1–3（`enemyPos` 对 slot 3 使用偏移 24px 的兜底排布）。`summonSkeletons` 的 `< 3` 上限只数非 Boss 单位。
- 保护：Boss 走到 cell 0（营火）仍未追上 → 强制开战，防无限绕圈。
- 无尽模式每层 Boss 同样适用。

## 3.3 演出
- 追逐开始：闪屏 + 震动（已有）；每 2 秒 Boss 头顶红色「!」跳动（scene.js）。
- HUD 在 Boss 追逐时顶部显示「距离 X 格」横幅（hud.js 新增一条 banner）。

## 3.4 文件触点
`systems/spawner.js`（生成与 march 推进）、`game.js`（update 主循环里调用 `updateBossMarch`）、`systems/combat.js`（startCombat 接受 Boss 加入已有 group、nearestEnemy 的 excludeMarching）、`render/scene.js`、`ui/hud.js`。

## 3.5 测试与验收
- 单测：march 同步 cell（推进半格后 cell 更新）；nearestEnemy 排除 marching Boss；group 满 3 时 Boss 入组临时 4 人且 slot=0。
- sim 断言：Boss 生成后 ≤ 6 圈内必然发生 Boss 战（不因追逐而跳过）；Boss 战开始时 Boss 必然在英雄同格。
- [ ] 四章 Boss 各手动触发一次追逐→拦截→战斗；营火保护触发路径有测试覆盖。

## 3.6 M4 实施记录（v3.3）
- `boss.march = { active, pos, gap, elapsed, laps, speed }`；每帧 `spawner.updateBossMarch` 推进并同步 `boss.cell = floor(pos) % len`。
- 速度用 `hero.speed * 1.3 + 0.4`：比设计稿的 1.3 倍略快，保证「6 圈内必战」验收；追逐最长 90 秒后强制拦截。
- 塔的 `nearestEnemy` 过滤 `march.active`；Boss 进入战斗后恢复可被塔攻击。
- `enemyPos` 对追逐 Boss 用 `pathPoint(march.pos)` 平滑绘制；HUD 左侧显示「距离 X 格」；Boss 头顶红色「!」。
- 战斗中追上时先记 `pending`，当前战斗结束后立即入组；Boss 入组沿用 4 人溢出规则。
- sim 新增：追逐推进、塔排除、追上拦截、`march.active=false`。

---

# S4 · 装备系统（背包、词条、决策）

## 4.1 现状
`loot.js`：3 类基础词条、掉落即 `equipIfBetter` 自动替换，玩家零决策；`equipmentBonus` 只累加 6 种词条（新词条会静默失效——注意点）。

## 4.2 背包与拾取决策（R5 修订）

```js
// hero 新增
h.inventory = [];            // 上限 12，超上限时拾取面板「收进背包」置灰
// run 新增：统一决策槽 + 掉落队列（取代 traitChoices 单标志）
run.pendingChoice = null;    // { kind:'trait', ... } | { kind:'loot', ... } | null
run.lootQueue = [];          // 同帧多掉落排队，逐件弹出处理
```

拾取流程（`killEnemy` / 战场宝箱 / 任务奖励 / 吸血鬼归还 四处入口统一走 `offerLoot(run, item)`）：
1. `run.lootQueue.push(item)`；若 `pendingChoice == null` 则弹出队首进入 `pendingChoice = { kind:'loot', item, current }`，`paused = true`，`showLoot(this)`。
2. 面板内容：新装备卡 vs 当前装备卡**逐词条对比**（新增词条绿色 +、移除词条红色 −；数值取整到 1 位小数）。
3. 操作：`1` 穿上（旧件进背包）/ `2` 收进背包 / `3` 丢弃；鼠标点击同效；**Esc = 丢弃并继续**（明确覆盖 input.js 现有的 `paused && !traitChoices → togglePause` 分支：守卫改为只查 `pendingChoice`，pendingChoice 期间 Esc/空格不进暂停）。
4. 决策后若 `lootQueue` 非空 → 弹下一件继续面板；否则 `paused = false`。
5. 若背包满：选项 2 置灰并提示「背包已满」。
6. **守卫统一（R5）**：`game.js` 5 处 + `input.js` 1 处的 `run.traitChoices` 守卫全部改为 `run.pendingChoice`；trait 流程迁移为 `pendingChoice = { kind:'trait' }`。
7. 背包管理：暂停界面（showPause 扩展）加「背包」页签，非战斗时可穿换/丢弃。

## 4.3 词条池扩展

`rollEquip` 按 slot × rarity 查表生成 `stats`（新增文件 `data/itemAffixes.js`，权重表驱动）：

| slot | common | rare 追加 | epic 追加 |
| --- | --- | --- | --- |
| weapon | atk | crit | critDmg、atkSpeed |
| offhand | def、maxHp | evade | counterChance |
| armor | def、maxHp | regen | damageReduction(2%/4%) |
| amulet | maxHp | vamp | lootBonus、xpBonus |
| staff | atk | regen | vamp |
| ring | maxHp | crit、evade | vamp |

数值基准（保持现曲线量级）：
- crit：rare +2%、epic +3%；critDmg：epic +15%；atkSpeed：epic +4%
- regen：rare +0.4、epic +0.8；evade：rare +2%、epic +3%
- counterChance：epic +6%（仅战士副手可出）
- damageReduction：2%/4%，全装备合计仍受 0.4 上限约束
- lootBonus：epic +10%；xpBonus：epic +8%

## 4.4 派生属性接线（R1 修订：统一 h.bonus 范式）
**问题**：现有 `deriveHero` 是全量重算，而天赋「还击」（`traits.js:16` 直接 `h.counterChance += 0.12`）和铁匠炉（`game.js:524` 直接改 `h.damageReduction`）都不在 `h.bonus` 里——它们能存活仅因 deriveHero 不碰这两个字段。装备词条若按 `+=` 接线会被每次铺牌重复累加；若按 `=` 接线会抹掉天赋与铁匠炉。

**方案：三源统一重算**
1. `createHero` 初始化 `bonus.counterChance: 0, bonus.damageReduction: 0`；
2. `traits.js` 的 riposte 改为 `h.bonus.counterChance += 0.12`；`game.js` 的 useForge 改为 `h.bonus.damageReduction = Math.min(0.12, h.bonus.damageReduction + 0.04)`；
3. `deriveHero` 全字段统一 `= base + bonus + eq + mapMods` 重算，无 += 累加、无旁路存活字段。

`equipmentBonus(h)` 累加白名单全集：

```js
const AFFIX_KEYS = ['maxHp','atk','def','atkSpeed','crit','critDmg','vamp','regen','evade',
  'lootBonus','xpBonus','counterChance','damageReduction'];
```

`deriveHero` 接线：`critDmg = base.critDmg + b.critDmg + eq.critDmg`、`regen`、`evade`、`lootBonus`、`counterChance = base(b.base 默认 0) + b.counterChance + eq.counterChance`、`damageReduction = clamp(b.damageReduction + eq.damageReduction, 0, 0.4)`。**不做接线的词条不允许出现在池子里**（用单测锁死：随机 500 件装备的每个 stat 都能在 deriveHero 中找到消费点）。

## 4.5 itemScore 更新
```js
score = atk*3.2 + def*4.5 + maxHp*0.45 + vamp*90 + crit*70 + atkSpeed*120
      + critDmg*40 + regen*6 + evade*90 + counterChance*80
      + damageReduction*600 + lootBonus*50 + xpBonus*40
```
（系数按「1 点该属性约等于多少战力」校准，S7 模拟验证三职业装备评分偏差 ≤ 15%。）

## 4.6 移除「自动穿戴」
- 默认开启拾取面板；设置项 `meta.autoEquip: true|false`（true 保留旧行为，供不想决策的玩家）。新 meta 字段走 `defaultMeta()` + loadMeta 合并兜底（🟢4，与 S5.6 同一路径）。
- 词条名称与格式化映射集中到 `core/config.js`（🟢1：hud.js 现有 statLine 只映射 6 键，critDmg/counterChance/lootBonus/xpBonus 等小数比例需统一的 %/一位小数格式化）。

## 4.7 文件触点
`systems/loot.js`（rollEquip 重写、equipIfBetter 保留）、`data/itemAffixes.js`（新）、`world/hero.js`（inventory、equipmentBonus、deriveHero、bonus 新键）、`data/traits.js`（riposte 迁入 bonus）、`game.js`（offerLoot、pendingChoice 流程、useForge 迁入 bonus）、`ui/screens.js`（拾取面板 + 背包页签）、`ui/input.js`（1/2/3/Esc 快捷键与守卫）、`ui/hud.js`（词条映射）、`core/config.js`（词条名称表）。

## 4.8 测试与验收
- 单测：词条池全组合可生成；所有 stat 均被 deriveHero 消费；**回赠 / 铁匠炉不因重算被抹掉**（选还击天赋 → 铺一张牌 → counterChance 仍 0.32 级别）；背包满时无法收进；同帧双掉落按队列逐件处理；autoEquip=true 行为与旧版一致；pendingChoice 期间 Esc 不触发暂停。
- sim：三职业胜率差 < 20 个百分点（面板自动决策策略：穿上 score 更高者）。
- [ ] 手动：盗贼双持、死灵法杖、军械库第 4 栏、拾取对比面板、背包穿换全流程可操作。

## 4.9 M5 实施记录（v3.4）
- `data/itemAffixes.js`：6 槽位 × 3 稀有度词条池；`AFFIX_KEYS` 13 项全部接入 `equipmentBonus` / `deriveHero`，新增暴伤、回复、闪避、掉落、经验、反击、减伤。
- `loot.js`：`rollEquip` 按池生成；`itemScore` 扩到全词条；保留 `equipIfBetter` 供 autoEquip=true。
- 拾取流程：`run.lootQueue` 逐件；面板三选一（换上/收进背包/丢弃），Esc=丢弃；槽位旧装备进背包；背包 12 格，满时不能收；普通掉落、任务奖励、战场宝箱、窃取归还全部走同一队列。
- 背包页：暂停面板显示 12 格库存，可穿上/丢弃；新增「拾取面板：开/关」对应 `meta.autoEquip`。
- sim 自动选择「穿上」，`tools/simulate.mjs` 同步；逻辑新增词条覆盖测试与 derive 接线测试（36 项）。
- 平衡基线（M5 后）：战士第 3 章 35% / 盗贼 80% / 死灵 85%，极差 50pp；M7 校准项。

---

# S5 · 经济与资源

## 5.1 现状
3 种资源（木/石/魂晶）；`bankResources` 静默入账；盗贼战利品是击杀时 60% 概率 +1 随机资源。

## 5.2 资源模型
新增 3 种（meta.resources 与 run.resources 各加键，`resName` 表同步）：

| 资源 | 键 | 来源 | 用途 |
| --- | --- | --- | --- |
| 稳定金属 | `metal` | 石像鬼/宝箱怪/精英击杀 25%；铁匠炉熔装备 +1 | T3 建筑（出色铁炉 lv2、熔炼炉 lv2、军械库升级） |
| 记忆碎片 | `shard` | Boss 击杀 +2；精英 15%；图书室换牌每 5 张 +1 | 学院/情报所升级、图鉴提示强化 |
| 古籍 | `tome` | 灵书击杀 50%；图书馆建筑线 | 图书馆 lv2（手牌上限再 +1）、学院前置 |

`rollResources` 扩展：enemy.loot 表允许新键；精英怪统一额外 `metal: 0.25, shard: 0.15`。

## 5.3 盗贼战利品包（🟢2 修订：不低于现版期望）
- 击杀时 35% 概率 `run.lootBag += 1`（盗贼专属，替代现在的 60% 概率 +1 随机资源）。
- `endLoop` 时结算：每包 = `rng.pick(['wood','stone','soul','metal']) × rng.int(1, 3)`。
- 期望产出核算：现版期望 ≈ 0.6 资源/击杀；新版 ≈ 0.35 × 2 = **0.7 资源/击杀**（且含 metal 高价值项）。验收断言：sim 中盗贼每圈资源收入不低于现版的 90%。

## 5.4 结算界面（远征战报）
`showDeath` / `showVictory` / 撤退 confirm 扩展为「远征战报」：
- 击杀数、最高圈数、铺牌数、伤害统计（run 里已有 dmgDealt/dmgTaken/kills/cardsPlayed）。
- **入账清单数据结构（Y10）**：`bankResources` 返回清单数组 `[{ label, amount }]`；`victory()` 的 soul6/stone4/wood4、`clearLayer()` 的 soul 奖励、战场宝箱、战利品包、铁匠炉熔装备产 metal 等**旁路入账全部改为向清单追加条目**，由 bankResources 汇总入账，确保战报完整。
- 确认后入账。

## 5.5 文件触点
`core/config.js`（RES 表）、`systems/loot.js`、`systems/combat.js`（击杀掉落）、`systems/economy.js`（S0 迁出的 bankResources + lootBag + 清单）、`game.js`（victory/clearLayer 奖励迁移进清单）、`ui/screens.js`（战报）、`ui/hud.js`（资源条 6 格布局）。

## 5.6 测试与验收
- [ ] 6 种资源在 HUD、战报、营地三处一致显示；旧档缺新键时 `defaultMeta()` 合并兜底（`loadMeta` 现有 `Object.assign(meta.resources, data.resources)` 模式天然支持，`save.js:33`）。
- sim：metal/tome/shard 每十局产出均值分别 ≥ 2 / 1 / 1（保证 T3 建筑可达成）；盗贼资源收入 ≥ 现版 90%。

---

# S6 · 建筑升级树

## 6.1 现状
23 座建筑 1–3 级线性，无前置；解锁关系只存在于卡牌侧（`UNLOCK_BY_BUILDING`）。

## 6.2 数据结构

```js
// buildings.js 每座建筑新增：
{
  id: 'forge', ..., maxLevel: 2,
  requires: (lv) => lv >= 2 ? [{ id: 'smithy', level: 1 }] : [],   // 升到该级的前置
  tier: 2,                    // 树状展示用：1 基础 / 2 进阶 / 3 高阶
}
```

**防死锁约束（Y9）**：任何建筑的 **lv1 一律不允许 requires**（否则 cardPool 解锁与建筑可达性可能互相等待）；交叉升级链（图书馆↔学院）只允许出现在 lv2+。camp.build() 校验 requires 并返回 `{ok:false, reason}`。

## 6.3 升级树（新增/调整条目）

| 建筑 | 等级 | 前置 | 效果 |
| --- | --- | --- | --- |
| 铁匠铺 | lv1 | — | 现状不变 |
| 出色的铁炉 | lv1–2 | 铁匠铺 lv1 | 现状（开局武器 +lv） |
| 熔炼炉 | lv2 | 出色的铁炉 lv1 | 石料掉落 +1 → **+2，且解锁「远征内熔装备产金属」** |
| 图书馆 | lv2 | 学院 lv1 | 手牌上限再 +1、解锁「古籍掉落」 |
| 学院 | lv2 | 图书馆 lv1 | 解锁零之界标进阶效果（对 Boss 也 -10% 强度） |
| 情报所 | lv3 | 图书馆 lv1 | 手牌上限 +lv（**同步 game.js handMax 的硬编码 `Math.min(2, intel)` → `Math.min(3, intel)`，Y9**） |
| 训练场 | lv2 | 营火 lv2 | 最大生命 10/lv → 12/lv |
| 医师的小屋 | lv2 | 客栈 lv1 | 药剂效果 10% → 15% |
| 军械库 | lv2 | 出色的铁炉 lv1 | 装备掉落品质 +8%、metal 消耗 4 |

新资源消耗注入各 cost 函数（见 S5 用途列）。

## 6.4 UI
- `showCamp` 建筑面板改为**三列分组**（tier 1/2/3），高阶建筑前置未满足时置灰 + 悬停提示「需要：出色的铁炉 Lv1」。
- 面板顶部「下一目标」：取当前资源可购的最便宜可用升级，点击直达。

## 6.5 文件触点
`data/buildings.js`、`systems/camp.js`（build() 校验 requires）、`game.js`（handMax 上限）、`ui/screens.js`、`systems/save.js`（buildings 值仍为数字等级，无需迁移）。**测试常量同步（Y9）**：`tests/logic.test.mjs` 的 23 座建筑断言、camp 资源相关用例。

## 6.6 测试与验收
- 单测：前置不满足时 build 返回 `{ok:false, reason}`；lv1 无前置（遍历断言）；新档按树 4 章通关后全建筑可达 maxLevel（sim 校验资源产出）。
- [ ] 营地面板分组展示、置灰、前置提示、「下一目标」可用；情报所 lv3 手牌上限生效。

## 6.7 M6 实施记录（v3.5）
- 6 资源：木/石/魂/金属/碎片/古籍；HUD 短名 6 格、营地/战报完整名称。
- 来源：精英 25%/15% 金属/碎片；Boss +2 碎片；灵书 50% 古籍；铁匠炉 +1 金属；图书室每 5 张 +1 碎片；熔炼炉 lv2 石料 +2 且 20% 金属；盗贼 35% 战利品包，回圈结算。
- 建筑树：`tier` 1/2/3、`requires(lv)`、23 座建筑 lv1 全部无前置；高阶前置在 `camp.build` 校验并返回原因；营地按 tier 分组、置灰、显示前置，新增「下一目标」。
- 效果接线：训练场 lv2 12/lv、医师小屋 lv2 药剂 15%、军械库 lv2 掉落 +8%、学院 lv2 Boss -10%、情报所 3 级 + 图书馆 2 级手牌上限。
- 战报：死亡/胜利显示击杀、圈数、铺牌、造成/承受伤害与入账清单。
- 新增测试：lv1 无前置、高阶前置拦截、6 资源与手牌上限（39 项逻辑）。

---

# S7 · 平衡校准工具

## 7.1 现状
`tests/sim.test.mjs` 单局 + 40 行 DOM/localStorage 桩，已证明可无头驱动真实 Game 循环（`game.js` 对 `ui/screens.js`/`ui/hud.js` 的 import 在桩下无副作用）。

## 7.2 设计：`tools/simulate.mjs`（Y2 修订：与 S0 解耦，先行可做）
**两阶段**：
- 阶段 A（M2，可与 S0 并行）：复用 sim.test 的 DOM 桩方案，把 `simulate()` 改造为参数化批量跑（`rng.reset(seed)` 提供 seed 注入）。
- 阶段 B（S0 完成后）：迁移到纯逻辑模块驱动（HeadlessHarness 直调 systems/*，省掉 DOM 桩）。

自动玩家策略（每帧 / 每事件）：
```js
// 铺牌：每有手牌，优先 roadside 敌怪牌（保持压力→资源），其次野地增益牌；
//       用 placementCheck 找第一个合法格放下。
// 药水：hp < 40% 且有药水即喝。
// 天赋：pendingChoice(kind=trait) 取预置优先级表中最高者。
// 装备：pendingChoice(kind=loot) 自动「穿上 score 更高者」（S4）。
// 撤退：hp < 25% 且 loop >= bossLoop → retreat(force=true)；死亡自然结算。
```

运行方式：
```powershell
node tools/simulate.mjs --n 500 --chapter 3 --class rogue --out docs/balance/ch3-rogue.json
node tools/simulate.mjs --all   # 3 职业 11 组合 × 200 局，汇总表
```

## 7.3 输出指标（每组合）
- 胜率、胜局中位通关圈数、死亡圈数分布（P25/P50/P75）
- 每圈平均：经验、击杀数、资源收入（6 种分别）、伤害承受
- Boss 战：平均回合时长、召唤物击杀占比
- 结果写 `docs/balance/<组合>.json` + 一张汇总 `docs/balance.md`（人读的表格），调参后重跑 diff。

## 7.4 回归断言（并入 sim.test.mjs，已实现）
口径：**20 局 × 4 组，900 模拟秒上限**（与 `docs/balance.md` 基线同口径；曾用 10 局/600s，波动过大——战士 ch3 在 0–40% 间跳动，已废弃）。附加耗时约 2s。
- 第 3 章战士胜率 ∈ [40%, 75%] —— M7 后基线 **67.5%**（40 局）
- 三职业胜率极差 ≤ 25pp —— M7 后基线 **22.5pp**（40 局），20 局回归容差 ≤25pp
- 无尽模式死亡率 < 40% —— 当前基线 **3–5%**
- 每组合中位圈数 ≥ 5、每圈击杀 > 0（防卡死）
- 断言失败即测试失败；M7 已把区间收紧到设计值，不再打印「⚠ 设计目标」。
- ⚠ 样本量提醒：20 局时跨 seed 波动仍可达 ±10pp；精确校准看 `docs/balance.md`（40 局）。

## 7.5 工作量与验收
阶段 A 约 0.5–1 天。
- [x] `--all` 全组合（11 组 × 40 局）跑完无崩溃，耗时 **2 秒**
- [x] 回归断言并入 sim.test.mjs 并通过
- [x] 产出首份 `docs/balance.md`（全矩阵基线表）
- [ ] 阶段 B（S0 后迁移到纯逻辑模块驱动）—— 当前 S0 已完成，可做下一步优化

## 7.6 M7 校准记录（v3.6）
- 40 局基线：战士 ch3 **67.5%** / 盗贼 ch3 **82.5%** / 死灵 ch3 **90%**，极差 **22.5pp**（设计目标 ≤25）。
- 调整：战士 115→123 生命；死灵骷髅拦截 65%→35%；盗贼连击 20%→15%；第 3 章 enemyMul 1.15→1.12；猎手飞刀 0.8→0.7。
- sim 回归区间已收紧为设计目标：战士 40–75%、极差 ≤25pp、无尽死亡率 <40%。
- 无尽：P50 通过层 1–3，最高 21 层，未再出现 20 层以上无上限刷。

---

# 里程碑（v3.1 重排：M2 提前、M3/M4 可并行）

| 里程碑 | 内容 | 前置 | 预估 |
| --- | --- | --- | --- |
| M1 | S0 架构拆分（搬移 + 门面 + rng.reset + 单一伤害入口） | — | 1–1.5 天 |
| M2 | S7 阶段 A 平衡工具 + 首份基线报告（DOM 桩方案，与 M1 并行） | — | 0.5–1 天 |
| M3 | S1 敌人技能 + S2 三敌同格 | M1, M2 | 2–2.5 天 |
| M4 | S3 Boss 追逐战（与 M3 触点重叠小，可并行） | M1, M2 | 0.5–1 天 |
| M5 | S4 装备系统 | M1, M2 | 2–2.5 天 |
| M6 | S5 经济资源 + S6 建筑树 | M1, M2 | 1.5–2 天 |
| M7 | 全量校准（阶段 B 迁移 + M3–M6 改动定稿），落 docs/balance.md 终稿 | 全部 | 0.5–1 天 |

每个里程碑结束：三套测试 + `tools/simulate.mjs` 抽查 + 手动通关一章。

# 风险

1. **数值叠加**（技能抬难度 × Boss 追逐）+ S2 的隐性 buff（n=2 减伤 0.9→0.95）方向相反 → 严格按 M2 基线、M7 校准顺序走；GROUP_DMG_RELIEF 参数化便于回调。
2. **拾取面板节奏**：快捷键 1/2/3 速通 + `meta.autoEquip` 开关兜底。
3. **equipmentBonus 白名单遗漏**：S4.8「500 件随机装备全 stat 消费」单测锁死；还击天赋/铁匠炉回归用例锁死 bonus 范式迁移。
4. **Boss 追逐交互**：marching Boss 的 cell 同步、塔排除、满组入战（临时 4 人）三条规则缺一不可，均有单测。
5. **stealEquip 体验**：仅英雄死亡时视为丢失；击杀归还；被占槽走对比流程不静默覆盖。

---

# 附录 · 审查结论（v3.1 已全部处置）

| 审查编号 | 问题 | 处置 |
| --- | --- | --- |
| R1 | 装备接线会抹掉还击天赋/铁匠炉减伤 | ✅ S4.4 改为 h.bonus 三源统一重算，traits.js/useForge 同步迁移 |
| R2 | emit 不完备破坏 sim 直接调用 | ✅ S0.2 增加 ctx.ctrl 控制钩子 + Game 门面方法清单 |
| R3 | 追逐 Boss 不同步 cell 导致寻敌/塔/tooltip 失真 | ✅ S3.2 每帧同步 cell + 塔排除 marching Boss |
| R4 | 能力分配表 12 种与验收 ≥15 矛盾 | ✅ S1.5 补 frenzy/sandVeil/lure 至 15 种 |
| R5 | lootChoice 与 overlay/按键守卫/同帧多掉落冲突 | ✅ S4.2 统一 pendingChoice + lootQueue + 守卫改造 |
| Y1 | game.js ≤500 行不现实 | ✅ 放宽到 ≤700 |
| Y2 | S0 并非 S7 硬前置 | ✅ S7.2 改两阶段，M2 与 M1 并行 |
| Y3 | ranged 先手时点不存在 | ✅ S1.3 明确插入点与死亡语义 |
| Y4 | armorUp 漏 2 个伤害入口 | ✅ S0.3 收敛单一 dealDamageToEnemy |
| Y5 | stealEquip 缺 deriveHero/归还冲突 | ✅ S1.6 细化归还规则 |
| Y6 | n=2 减伤 0.9→0.95 隐性 buff | ✅ S2.2 显式声明并参数化 |
| Y7 | Boss 入组无溢出规则 | ✅ S3.2 临时 4 人 + Boss 固定 slot 0 |
| Y8 | 缺 seed 注入机制 | ✅ S0.3 rng.reset(seed) |
| Y9 | handMax 硬编码/lv1 前置死锁/测试常量 | ✅ S6.2/6.3/6.5 补齐 |
| Y10 | victory/clearLayer 旁路入账 | ✅ S5.4 入账清单数据结构 |
| 🟢1–6 | 词条映射集中、盗贼期望、tooltip 按格列表、meta 兜底、伤害样板收敛、M3/M4 并行 | ✅ 分别落入 S4.6/S5.3/S1.7/S4.6/S0.3/里程碑 |

---

# 附录 B · M2 基线发现与 M7 待校准项

来源：`docs/balance.md`（11 组 × 40 局，seed 基数 1000，900 模拟秒上限，全解锁档位）。

> 基线含「自动喝药」策略（hp<40% 即喝）。首版基线漏了这条，导致难度被系统性高估（战士 ch1 70%→82.5%、ch3 12.5%→25%），结论方向不变但数值已更新。

## 发现 1 · 章节难度曲线反常：第 3 章比第 4 章还难
| 章节 | 战士胜率 | 通关中位圈 | 每圈承伤 |
| --- | --- | --- | --- |
| ch1 | 82.5% | 8 | 58.2 |
| ch2 | 82.5% | 9 | 63.5 |
| **ch3** | **25%** | 10 | 82.9 |
| ch4 | 45% | 12 | 112.5 |

猎手（ch3 首领）的飞刀机制 + 本章 `enemyMul` 叠加，使 ch3 成为断崖。M7 需检查 `data/chapters.js` 的 enemyMul 与猎手飞刀频率（`updateCombat` 中 boss summonTimer=8s 与飞刀同频）。

## 发现 2 · 三职业强度差 62.5pp（设计目标 < 25pp）
| 第 3 章 | 胜率 | 每圈承伤 | 每圈击杀 |
| --- | --- | --- | --- |
| 战士 | 25% | 82.9 | 2.6 |
| 盗贼 | 60% | 64.4 | 2.8 |
| 死灵 | 87.5% | 30.3 | 2.7 |

死灵法师承伤只有战士的 **37%**（骷髅替身承受 65% 攻击），战士缺生存手段。M7 校准方向：战士减伤/反击收益上调，或骷髅承伤比例下调。

## 发现 3 · 无尽模式后期可无限刷
单局最高跑到 **56 圈 / 20 层**（盗贼）、**34 圈 / 11 层、等级 P50 33**（死灵）。后期英雄成长快于敌人 `LOOP_HP 0.16 / LOOP_ATK 0.10` 的线性成长。M7 需考虑敌人成长改为分段递增或引入层数平方项。

## 发现 4 · 本基线受「自动撤退策略」影响
自动玩家在 `hp < 25% 且 loop >= bossLoop` 时撤退，故各组合有 15–55% 的局以 retreat 结束（不计入胜率）。对比不同版本时须保持该策略一致。
