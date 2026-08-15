/* ================= 启动入口（boot） =================
 * 在 core.js 与 modules/*.js 全部加载后执行。
 * 说明：initApp 为 async，内部首个 await 会挂起，确保模块注册已完成。
 * KaTeX 现按需懒加载：core.js 的 loadKatex().onload 会在库加载完成后自动重排公式，
 * 因此这里不再需要额外监听 window.load 来 render。
 */
initApp();
