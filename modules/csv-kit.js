/* ================= CSV 工具箱（csv-kit） =================
 * 全站共用的 CSV 解析 / 导出工具。此前在 macro.js / valuation.js / datahub.js /
 * earnings.js 各有一份重复实现，现统一到这里（单一实现，行为以本文件为准）。
 * 须在所有投资模块之前加载（invest.html 已排在模块最前）。
 *
 *   GT_CSV.parseCsvSimple(text)          → string[][]（支持引号内逗号、跨行字段）
 *   GT_CSV.downloadCsv(filename, content)→ Promise<boolean>（另存为，回退直接下载）
 */
window.GT_CSV = (function(){

  // 简单 CSV 行解析（逐行 + 引号内逗号处理 + 跨行合并）
  function parseCsvSimple(text){
    const rawLines = String(text == null ? '' : text).replace(/\r\n/g, '\n').replace(/^\uFEFF/, '').split('\n');
    const lines = [];
    let pending = null;
    for(const ln of rawLines){
      if(pending != null){ pending += '\n' + ln; }
      else pending = ln;
      // 统计引号是否闭合
      let q = 0; for(const ch of pending) if(ch === '"') q++;
      if(q % 2 === 0){ lines.push(pending); pending = null; }
    }
    if(pending != null) lines.push(pending);
    const out = [];
    for(const ln of lines){
      if(!ln.trim()) continue;
      const f = [];
      let field = '', inQ = false;
      for(let i = 0; i < ln.length; i++){
        const ch = ln[i];
        if(inQ){
          if(ch === '"'){ if(ln[i+1] === '"'){ field += '"'; i++; } else inQ = false; }
          else field += ch;
        } else {
          if(ch === '"') inQ = true;
          else if(ch === ','){ f.push(field); field = ''; }
          else field += ch;
        }
      }
      f.push(field);
      out.push(f);
    }
    return out;
  }

  // 触发导出 CSV 文件。
  // 优先使用 File System Access API：弹出系统「另存为」对话框，可自行选定保存文件夹；
  // 不支持该 API 的浏览器（Firefox/Safari）回退为直接下载到默认下载目录。
  // 返回 Promise<boolean>：是否成功完成（用户取消返回 false）。
  function downloadCsv(filename, content){
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const trySave = async () => {
      if(window.showSaveFilePicker){
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: 'CSV 数据', accept: { 'text/csv': ['.csv'] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return true;
        } catch(e){
          if(e && e.name === 'AbortError') return false;   // 用户取消，不报错不下载
          console.warn('另存为导出失败，改用下载方式:', e);
        }
      }
      // 回退：不支持 API 或保存失败，直接下载
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
      return true;
    };
    return trySave();
  }

  return { parseCsvSimple, downloadCsv };
})();
