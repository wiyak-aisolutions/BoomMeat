await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:8781/index.html?nc=' + Date.now() + '#home' }); await sleep(4500);
const R = await ev(`
  const sleep=ms=>new Promise(r=>setTimeout(r,ms)), out={}, S=ERP.S, q=s=>document.querySelector(s), qa=s=>[...document.querySelectorAll(s)], txt=e=>e?e.textContent.replace(/\\s+/g,' ').trim():null;
  const U=id=>{ERP.setUser(id); UI.render();}, us=r=>S.users.filter(u=>u.role===r);
  out.v=[...document.scripts].map(s=>s.src).find(s=>/app.js/.test(s)).split('?')[1];
  U(us('supervisor')[0].id);
  const lot=S.lots.find(l=>l.qty>60000&&['meat','carcass'].includes(ERP.item(l.itemId).cat)&&!ERP.item(l.itemId).rework);
  const run=ERP.openButchery({date:ERP.today(),lotId:lot.id,qty:50000}); out.run=run.no;
  // supervisor's butchery page still works after the refactor
  location.hash='#butchery/'+run.id; await sleep(700); out.bossForm=!!q('#bo-i')&&!!q('[data-act=bu-newitem]'); out.bossBtns=qa('.sheet-hd .btn').map(txt);
  // meat worker
  U(us('worker')[0].id); location.hash='#worker'; await sleep(600);
  out.tabs=qa('.wk-views button').map(txt);
  UI.ACTS['wk-view']('cut'); await sleep(400);
  out.runCards=qa('.wk-b').map(txt); out.autoPicked=!!q('#bo-i'); out.newItemHidden=!q('[data-act=bu-newitem]'); out.noClose=!q('[data-act=bu-close]')&&!q('[data-act=bu-in]');
  out.smart=qa('.smart>div').map(txt);
  const cut=[...q('#bo-i').options].find(o=>o.parentElement.label.includes('قطعيات')); q('#bo-i').value=cut.value; q('#bo-q').value='12.5'; q('[data-act=bu-add]').click(); await sleep(600);
  out.toast1=txt(qa('.toast').pop()); out.rows1=qa('table.t tbody tr').map(txt);
  q('#bo-m').value='n'; q('#bo-m').dispatchEvent(new Event('change')); await sleep(400); q('#bo-c').value='6'; q('#bo-z').value='500'; q('[data-act=bu-add]').click(); await sleep(600);
  out.rows2=qa('table.t tbody tr').map(txt); out.smart2=qa('.smart>div').map(txt);
  q('#bo-m').value='kg'; q('#bo-m').dispatchEvent(new Event('change')); await sleep(300); q('#bo-q').value='999'; q('[data-act=bu-add]').click(); await sleep(500); out.overToast=txt(qa('.toast').pop());
  // bags
  q('[data-act=bu-pack]').click(); await sleep(400); out.bagDlg=txt(q('#modal-root h3')); qa('.bp-q')[0].value='18'; qa('.bp-q')[0].dispatchEvent(new Event('input',{bubbles:true})); q('[data-act=msave]').click(); await sleep(700); out.bagErr=txt(q('#merr')); out.bagsLine=txt(q('.bar .crumb'));
  // drop a line
  q('[data-act=bu-drop]').click(); await sleep(500); out.rowsAfterDrop=qa('table.t tbody tr').length;
  // packer sees it too; cannot close
  U(us('packer')[0].id); location.hash='#worker'; await sleep(500); out.packerTabs=qa('.wk-views button').map(txt); UI.ACTS['wk-view']('cut'); await sleep(400); out.packerSees=qa('.wk-b').length;
  try{ ERP.closeButchery({id:run.id,date:ERP.today(),wh:ERP.whs('raw')[0]}); out.packerClose='CLOSED?!'; }catch(e){ out.packerClose='refused: '+e.message; }
  try{ ERP.butcheryInput({id:run.id,lotId:lot.id,qty:1000}); out.workerInput='ADDED?!'; }catch(e){ out.workerInput='refused: '+e.message; }
  U(us('worker')[0].id); UI.ACTS['wk-view']('cut'); await sleep(400);
  return out;`);
console.log(JSON.stringify(R, null, 1)); await shot('wc-worker');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
const M = await ev(`UI.render(); await new Promise(r=>setTimeout(r,700)); return {overflow:document.documentElement.scrollWidth-innerWidth};`); console.log('mobile', JSON.stringify(M)); await shot('wc-worker-m');
console.log('LOGS', JSON.stringify([...new Set(logs)].slice(0,8))); chrome.kill(); process.exit(0);
