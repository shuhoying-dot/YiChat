// 适配器注册表：新增平台时，只需在 src/adapters/ 或 src/extensions/ 下新建模块，
// 然后在这里加一行 require + 注册即可，无需改动其他代码。
//
// 状态机（每个适配器独立）：
//   disconnected（未连接） -> connecting（连接中） -> connected（已连接）
//                                                     -> connected-mock（已连接·演示数据）
// mock 模式会在 UI 上标注"演示数据"，与真实连接区分。

const adapters = {
  // Mock 演示平台（Phase 1 遗留）
  mock: require('./mock'),
  // Signal：signal-cli 真实模式 / 自动降级 mock
  signal: require('./signal'),
  // LINE / KakaoTalk：扩展模块骨架（当前均为演示数据模式）
  line: require('../extensions/line'),
  kakao: require('../extensions/kakao'),
};

// 各适配器当前状态
const statuses = {};
for (const id of Object.keys(adapters)) statuses[id] = 'disconnected';

// 取某个适配器实例，不存在时抛错
function getAdapter(id) {
  const a = adapters[id];
  if (!a) throw new Error('未知平台: ' + id);
  return a;
}

// 带状态跟踪的连接：connecting -> connected / connected-mock
async function connectAdapter(id, options) {
  const adapter = getAdapter(id);
  statuses[id] = 'connecting';
  try {
    const result = await adapter.connect(options || {});
    statuses[id] = result && result.mock ? 'connected-mock' : 'connected';
    return result;
  } catch (e) {
    statuses[id] = 'disconnected';
    throw e;
  }
}

// 断开：状态回到 disconnected
async function disconnectAdapter(id) {
  const adapter = getAdapter(id);
  const result = await adapter.disconnect();
  statuses[id] = 'disconnected';
  return result;
}

// 取某个适配器的当前状态
function getAdapterStatus(id) {
  getAdapter(id); // 不存在时抛错
  return statuses[id] || 'disconnected';
}

// 列出所有已注册平台（id / name / icon / status / mock，供渲染层展示）
function listAdapters() {
  return Object.values(adapters).map((a) => ({
    id: a.id,
    name: a.name,
    icon: a.icon,
    status: statuses[a.id] || 'disconnected',
    mock: (statuses[a.id] || '') === 'connected-mock' || (typeof a.getMode === 'function' && a.getMode() === 'mock'),
  }));
}

module.exports = { getAdapter, connectAdapter, disconnectAdapter, getAdapterStatus, listAdapters };
