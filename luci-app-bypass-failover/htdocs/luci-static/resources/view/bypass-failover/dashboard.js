'use strict';
'require view';
'require fs';
'require poll';
'require ui';

var CMD='/usr/libexec/bypass-failover-web';
var header, guide, advanced, events, addrInput, testInput, proxyInput, lastStatus, bootBox;
function isZh() {
 var lang=String(L.env.lang || '').toLowerCase().replace('_','-');
 if (lang.indexOf('zh')===0) return true;
 if (lang.indexOf('en')===0) return false;
 return /[\u3400-\u9fff]/.test([_('System'),_('Status'),_('Network')].join(' '));
}
function T(c,e) { return isZh()?c:e; }
function run(action,args) {
 return fs.exec(CMD,[action].concat(args||[])).then(function(r){
  if (r.code) throw new Error(r.stderr || T('操作未成功','Operation failed'));
  return r.stdout||'';
 });
}
function parse(s) {
 var o={}; (s||'').trim().split('\n').forEach(function(l){
  var i=l.indexOf('='); if(i>=0) o[l.slice(0,i)]=l.slice(i+1);
 }); return o;
}
function textLine(label,value) { return E('p',{},[E('strong',{},label+': '),value]); }
function message(text,error) {
 ui.addNotification(null,E('p',{},text),error?'danger':'info');
}
function showError(e) {
 var s=String(e.message||e);
 var dict=[
  ['forwarding path not verified',T('尚未完成安全验证，不能开启全屋保护。','Full-home protection is locked until validated.')],
  ['real proxy health check failed',T('代理连通性检查失败。','Proxy connectivity check failed.')],
  ['Invalid bypass IP',T('请输入正确的旁路由 IPv4 地址。','Enter a valid bypass router IP.')],
  ['Bypass is not on the LAN',T('旁路由不在主路由局域网内。','Bypass router is not on this LAN.')],
  ['Proxy endpoint must',T('代理检测入口不正确。','Invalid proxy test endpoint.')],
  ['test client IP not configured',T('请先填写测试设备地址。','Enter a test client IP first.')],
  ['proxy exit check failed',T('代理出口测试尚未通过，未修改网络。','Proxy check failed; no routing changes made.')],
  ['bypass connectivity check failed',T('旁路由连接检查失败，没有修改网络。','Bypass router unreachable; no routing changes made.')],
  ['test client MAC not resolved',T('未发现测试设备，请先让该设备连接 Wi-Fi 并访问一个网页，再进行测试。','Test device not found. Connect it and open a page before retrying.')]
 ];
 dict.some(function(d){if(s.indexOf(d[0])>=0){s=d[1];return true;}return false;});
 message(s,true);
}
function renderSummary(data) {
 var s=parse(data);
 var address=s.bypass||'';
 if (document.activeElement!==addrInput) addrInput.value=address;
 var active=s.mode==='auto' && s.state==='bypass';
 header.replaceChildren(
  E('h3',{},active?T('网络保护运行中','Network protection active'):T('网络保护尚未开启','Network protection is not active')),
  E('p',{},active?T('正在使用旁路由；出现异常时将尝试切回主路由。','Using bypass router with fallback enabled.'):
    T('你的网络保持原样。完成检查后，才能开启自动保护。','Your network is unchanged. Complete checks before enabling protection.')),
  E('p',{},s.test==='running'?
    T('临时测试进行中，剩余约 '+(s.test_remaining||'?')+' 秒；已匹配 '+(s.test_packets||'0')+' 个数据包（不代表代理成功）。','Temporary test: '+(s.test_remaining||'?')+' seconds left; '+(s.test_packets||'0')+' matched packets (not proof of proxy).'):
    s.test==='rolled_back'?
    T('检测到测试保护进程异常，已尝试撤销测试规则。','Test watchdog failed; temporary rules were withdrawn where possible.'):
    T('当前没有运行临时引流测试。','No temporary route test is active.'))
 );
 var configured=!!address;
 var validated=s.forwarding_verified==='1' && s.proxy_check==='configured';
 guide.replaceChildren(
  E('h3',{},T('只需三步','Just three steps')),
  E('div',{'class':'cbi-section'},[
   E('h4',{},T('第一步：填写旁路由地址','Step 1: Enter bypass router IP')),
   E('p',{},T('通常可以在旁路由管理页面查看，不需要填写端口。','Find this IP on your bypass router. No port required.')),
   addrInput,
   ' ',
   E('button',{'class':'btn cbi-button-action','click':function(){
    var ip=addrInput.value.trim();
    run('set-bypass',[ip]).then(function(){message(T('地址已保存。','Address saved.'));return reload();}).catch(showError);
   }},T('保存地址','Save address'))
  ]),
  E('div',{'class':'cbi-section'},[
   E('h4',{},T('第二步：检查网络','Step 2: Check connection')),
   E('p',{},T('点击后自动保存地址并检测连接，不会更改流量转发规则。','Saves the IP and tests connectivity without modifying traffic routing.')),
   E('button',{'class':'btn cbi-button','click':function(){
    var entered=addrInput.value.trim();
    if (!entered) { message(T('请先填写旁路由地址。','Enter the bypass router IP first.'),true); return; }
    var save=entered===address ? Promise.resolve() : run('set-bypass',[entered]);
    save.then(function(){ return run('check'); }).then(function(v){
     message(v.trim()==='healthy'?
      T('旁路由连接正常。代理出口和故障回退尚需进一步验证。','Bypass router reachable. Proxy and failover not yet verified.'):
      T('未能连接旁路由，请检查地址或旁路由状态。','Bypass router unreachable.'));
    }).catch(showError);
   }},T('一键检查','Check now'))
  ]),
  E('div',{'class':'cbi-section'},[
   E('h4',{},T('第三步：开启自动保护','Step 3: Turn on protection')),
   E('p',{},validated?
     T('已配置检测入口并记录转发验证标志；开启前仍应确认真实回程测试。','Configuration flag present; confirm real-world return-path testing.'):
     T('仍需完成真实引流与回退测试。为保护家庭网络，暂不允许开启。','Real routing and fallback tests are still required. Activation remains locked for safety.')),
   E('button',{'class':'btn cbi-button-positive','disabled':!validated,'click':function(){
    ui.showModal(T('确认开启','Confirm activation'),[
     E('p',{},T('开启后会修改 IPv4 策略路由。确认已完成真实回程验证。','This changes live IPv4 routing. Confirm return-path validation.')),
     E('button',{'class':'btn','click':ui.hideModal},T('取消','Cancel')),' ',
     E('button',{'class':'btn cbi-button-positive','click':function(){ui.hideModal();run('auto').then(reload).catch(showError);}},T('确认','Confirm'))
    ]);
   }},T('开启自动保护','Enable protection')),
   ' ',
   E('button',{'class':'btn cbi-button-negative','click':function(){
    run('direct').then(reload).catch(showError);
   }},T('恢复主路由直连','Use primary router directly'))
  ])
 );
 if (proxyInput && document.activeElement!==proxyInput) proxyInput.value=s.proxy_endpoint||'';
 if (testInput && document.activeElement!==testInput) testInput.value=s.test_client||'';
 return s;
}
function renderBoot(status) {
 var on=status.trim()==='enabled';
 bootBox.replaceChildren(
  E('h3',{},T('开机自动启动','Start automatically at boot')),
  E('p',{},on?T('已开启：重启后启动监控服务。是否引流仍由网络保护设置决定。','Enabled: monitoring starts after reboot; routing still follows protection settings.'):
      T('已关闭：路由器重启后不自动启动本插件。','Disabled: this service will not start automatically after reboot.')),
  E('button',{'class':'btn cbi-button','click':function(){
   run(on?'boot-disable':'boot-enable').then(function(v){ renderBoot(v); message(on?T('已关闭开机启动','Autostart disabled'):T('已开启开机启动','Autostart enabled')); }).catch(showError);
  }},on?T('关闭开机启动','Disable autostart'):T('开启开机启动','Enable autostart'))
 );
}
function reload() {
 return Promise.all([run('status'),run('logs'),run('boot-status')]).then(function(a){
  if (a[0] !== lastStatus) { renderSummary(a[0]); lastStatus=a[0]; }
  events.textContent=a[1]||T('暂无事件','No events');
  renderBoot(a[2]);
  return a[0];
 }).catch(showError);
}
return view.extend({
 load:function(){return Promise.all([run('status'),run('logs'),run('boot-status')]);},
 render:function(data){
  var s=parse(data[0]);
  header=E('div',{'class':'cbi-section'});
  bootBox=E('div',{'class':'cbi-section'});
  guide=E('div',{});
  addrInput=E('input',{'class':'cbi-input-text','type':'text','placeholder':'192.168.1.2','value':s.bypass||''});
  testInput=E('input',{'class':'cbi-input-text','type':'text','placeholder':'192.168.1.100','value':s.test_client||''});
  proxyInput=E('input',{'class':'cbi-input-text','type':'text','placeholder':'socks5h://192.168.1.2:实际端口','value':s.proxy_endpoint||''});
  events=E('pre',{'style':'white-space:pre-wrap;max-height:280px;overflow:auto'},data[1]||T('暂无事件','No events'));
  advanced=E('details',{'class':'cbi-section'},[
   E('summary',{'style':'cursor:pointer;font-weight:bold;padding:12px 0'},T('高级设置（了解网络的用户）','Advanced settings (experienced users)')),
   E('p',{},T('以下为维护工具。单设备透明 TCP 测试不再要求 SOCKS5；但真实代理、回程与回退仍需人工核验。','Maintenance tools. Transparent TCP test no longer requires SOCKS5; forwarding and rollback still need real-world verification.')),
   E('h4',{},T('真实代理检测','Real proxy check')),
   proxyInput,' ',
   E('button',{'class':'btn cbi-button','click':function(){run('set-proxy',[proxyInput.value.trim()]).then(reload).catch(showError);}},T('保存检测入口','Save test endpoint')),
   ' ',
   E('button',{'class':'btn cbi-button','click':function(){run('check-proxy').then(function(v){message(v.trim()==='proxy_healthy'?T('代理检测通过','Proxy check passed'):T('代理出口不可用或未配置','Proxy unavailable or not configured'));}).catch(showError);}},T('检测代理','Check proxy')),
   E('h4',{},T('指定设备临时测试','Temporary single-client test')),
   testInput,' ',
   E('button',{'class':'btn cbi-button','click':function(){run('set-client',[testInput.value.trim()]).then(reload).catch(showError);}},T('保存测试设备','Save test client')),
   ' ',
   E('button',{'class':'btn cbi-button','click':function(){
    ui.showModal(T('确认临时测试','Confirm temporary test'),[
     E('p',{},T('仅对指定设备做透明 TCP 临时引流。可能断网；主路由看门狗最长约 60 秒撤销规则。测试启动不代表代理出口验证通过。','Temporary transparent TCP route for one device only. Connectivity may break; rollback depends on the primary-router watchdog. Test start is not proof of proxy functionality.')),
     E('button',{'class':'btn','click':ui.hideModal},T('取消','Cancel')),' ',
     E('button',{'class':'btn cbi-button-positive','click':function(){ui.hideModal();run('test-start').then(reload).catch(showError);}},T('开始测试','Start test'))
    ]);
   }},T('运行 60 秒测试','Run 60-second test')),
   ' ',
   E('button',{'class':'btn cbi-button-negative','click':function(){run('test-stop').then(reload).catch(showError);}},T('撤销测试','Cancel test')),
   E('h4',{},T('诊断','Diagnostics')),
   E('button',{'class':'btn cbi-button','click':function(){run('preflight').then(function(v){message(v);}).catch(showError);}},T('查看诊断详情','Show diagnostics')),
   E('h4',{},T('运行日志','Event log')),events
  ]);
  renderSummary(data[0]);
  renderBoot(data[2]);
  lastStatus=data[0];
  poll.add(reload,5);
  return E('div',{},[
   E('h2',{},T('智能网络保护','Smart network protection')),
   E('p',{},T('旁路由异常时，尽可能保障网络正常访问。首次使用请从第一步开始。','Help keep the network connected if a bypass router fails. Start at step one.')),
   header,guide,bootBox,advanced,
   E('p',{},T('开发预览：目前不能保证旁路由整机故障时自动接管；高级测试通过前请勿手动解除保护限制。','Development preview: full failover is not yet validated. Do not bypass safety restrictions.'))
  ]);
 },
 handleSaveApply:null,handleSave:null,handleReset:null
});
