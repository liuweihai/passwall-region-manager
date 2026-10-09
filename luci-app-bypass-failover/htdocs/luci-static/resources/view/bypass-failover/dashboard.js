'use strict';
'require view';
'require fs';
'require poll';
'require ui';
var CMD='/usr/libexec/bypass-failover-web', statusBox, logBox;
function call(arg) {
 return fs.exec(CMD, [arg]).then(function(r) {
  if (r.code) throw new Error(r.stderr || 'Request failed');
  return r.stdout || '';
 });
}
function healthMessage(raw) {
 var result = (raw || '').trim();
 var lang = String(L.env.lang || '').toLowerCase();
 var chinese = lang.indexOf('zh') === 0;
 if (result === 'healthy')
  return chinese ? '检测通过：旁路由 Ping 和 DNS 均正常（不代表代理出口正常）。' : 'Health check passed: bypass router Ping and DNS respond (proxy exit not verified).';
 if (result === 'unhealthy')
  return chinese ? '检测失败：旁路由 Ping 或 DNS 不可用。' : 'Health check failed: bypass router Ping or DNS is unavailable.';
 return chinese ? '检测返回：' + result : 'Health check returned: ' + result;
}
function error(e) { ui.addNotification(null, E('p', {}, String(e.message || e)), 'danger'); }
function refresh() {
 return Promise.all([call('status'),call('logs')]).then(function(r) {
  statusBox.textContent=r[0];
  logBox.textContent=r[1] || '尚无记录';
 }).catch(error);
}
return view.extend({
 load: function() { return Promise.all([call('status'),call('logs')]); },
 render: function(data) {
  statusBox=E('pre', {'style':'white-space:pre-wrap'}, data[0]);
  logBox=E('pre', {'style':'white-space:pre-wrap;max-height:320px;overflow:auto'}, data[1]||'尚无记录');
  poll.add(refresh, 5);
  return E('div', {}, [
   E('h2', {}, '旁路由智能容灾 · v0.2.0-dev'),
   E('p', {}, '安装位置：小米主路由。仅处理 IPv4；默认直连。启用自动模式前请确认旁路由可接收来自主路由的转发流量。'),
   E('div', {'class':'cbi-section'}, [
    E('h3', {}, '运行状态'),statusBox,
    E('button', {'class':'btn cbi-button', 'click':function(){call('preflight').then(function(v){ui.addNotification(null,E('pre',{},v));}).catch(error);}}, '运行安全预检'),
    ' ',
    E('button', {'class':'btn cbi-button', 'click':function(){call('check-proxy').then(function(v){ui.addNotification(null,E('p',{},v.trim()==='proxy_healthy' ? '代理出口检测通过 / Proxy exit healthy' : '代理出口检测未通过 / Proxy exit unavailable'));}).catch(error);}}, '检测真实代理出口'),
    ' ',
    E('button', {'class':'btn cbi-button', 'click':function(){call('check').then(function(v){ui.addNotification(null,E('p',{},healthMessage(v)));}).catch(error);}}, '检查旁路由'),
    ' ',
    E('button', {'class':'btn cbi-button-negative', 'click':function(){call('direct').then(refresh).catch(error);}}, '强制小米直连'),
    ' ',
    E('button', {'class':'btn cbi-button-positive', 'click':function(){
      ui.showModal('确认启动自动容灾', [
       E('p', {}, '自动模式会修改小米运行时 IPv4 策略路由。请先确认已备份网络配置并具备本地管理入口；首次部署应有旁路由接管转发的验证。'),
       E('div', {'class':'right'}, [
        E('button', {'class':'btn','click':ui.hideModal},'取消'),' ',
        E('button', {'class':'btn cbi-button-positive','click':function(){ui.hideModal();call('auto').then(refresh).catch(error);}},'确认启动')
       ])
      ]);
    }}, '启用自动容灾')
   ]),
   E('div', {'class':'cbi-section'}, [E('h3', {}, '最近运行日志'), logBox]),
   E('p', {}, '开发预览：IPv6 保留现状；DNS 保持主路由原配置；Webhook 需额外配置，真实出口检测需填代理端点。未经回程验证，程序会拒绝开启自动引流。')
  ]);
 },
 handleSaveApply:null,handleSave:null,handleReset:null
});
