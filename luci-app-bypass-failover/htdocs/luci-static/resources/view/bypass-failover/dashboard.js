'use strict';
'require view';
'require fs';
'require poll';
'require ui';

var CMD='/usr/libexec/bypass-failover-web';
var header, guide, advanced, events, addrInput, testInput, proxyInput, lastStatus, bootBox;
var safeResult, safeProgress, safePrevious='', safeRemaining=0, safeState='idle';
function paintSafeCountdown() {
 if (!safeResult) return;
 safeResult.textContent=safeState==='running'?
  T('隔离规则回滚倒计时：','Isolated rollback countdown: ')+safeRemaining+T(' 秒',' seconds'):
  safeState==='passed'?T('60 秒回滚验收通过（隔离规则）','Isolated rule rollback passed'):
  safeState==='failed'?T('回滚验收未通过，请查看日志','Rollback verification failed; see logs'):
  safeState==='stopped'?T('测试已取消','Test cancelled'):T('当前未运行安全回滚测试','No safe rollback test active');
 if (safeProgress) safeProgress.value=safeState==='running'?60-safeRemaining:safeState==='passed'?60:0;
}
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
  ['test client MAC not resolved',T('测试设备识别失败，详情：','Test device lookup failed; details: ')+s]
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
    T('临时测试剩余约 '+(s.test_remaining||'?')+' 秒；入口 '+(s.test_packets||'0')+' 包、出口 '+(s.test_egress_packets||'0')+' 包（不代表代理成功）。','Temporary test: '+(s.test_remaining||'?')+'s; marked '+(s.test_packets||'0')+', 出口 '+(s.test_egress_packets||'0')+' packets (not proxy proof).'):
    s.test==='rolled_back'?
    T('检测到测试保护进程异常，已尝试撤销测试规则。','Test watchdog failed; temporary rules were withdrawn where possible.'):
    T('当前没有运行临时引流测试。','No temporary route test is active.'))
 );
 var configured=!!address;
 var validated=true;
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
   E('p',{},T('两步检测：旁路由是否在线；在线后测试经过旁路由的 HTTPS 外网路径。不检查代理工具或节点。','Two stages: side router online, then routed HTTPS. No proxy-specific checks.')),
   E('button',{'class':'btn cbi-button','click':function(){
    var entered=addrInput.value.trim();
    if (!entered) {message(T('请先填写旁路由地址。','Enter bypass IP first.'),true);return;}
    var save=entered===address?Promise.resolve():run('set-bypass',[entered]);
    save.then(function(){return run('health-report');}).then(function(raw){
     var v=parse(raw);
     var ok=v.external==='reachable_via_side_route';
     message(ok?T('检测成功','Check successful'):T('检测失败','Check failed'),!ok);
     reload();

    }).catch(showError);
   }},T('检查旁路由与外网','Check side and Internet'))
  ]),
  E('div',{'class':'cbi-section'},[
   E('h4',{},T('第三步：开启自动保护','Step 3: Turn on protection')),
   E('p',{},validated?
     T('全屋自动模式为实验功能：失败三次回退主路由，恢复五次后重新引流；可随时手动恢复直连。','Experimental full-home mode: fall back after 3 failures; retry after 5 successes. Manual direct mode remains available.'):
     T('仍需完成真实引流与回退测试。为保护家庭网络，暂不允许开启。','Real routing and fallback tests are still required. Activation remains locked for safety.')),
   E('button',{'class':'btn cbi-button-positive','click':function(){
    ui.showModal(T('确认开启','Confirm activation'),[
     E('p',{},T('开启后全屋 TCP 流量可能改走旁路由，出现断网可点击恢复主路由直连。','This may reroute home TCP traffic through the side router. You can restore direct mode manually.')),
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
 return Promise.all([run('status'),run('logs'),run('boot-status'),run('safe-test-status')]).then(function(a){
  var lines=a[3].trim().split('\n');
  var state=lines[0]||'idle', remain=(lines[1]||'').replace('remaining=','');
  safeState=state;
  if (state==='running') safeRemaining=Math.max(0,Math.min(60,Number(remain)||0));
  paintSafeCountdown();
  if(state!==safePrevious && safePrevious==='running' && state==='passed')
   message(T('安全回滚测试成功','Safe rollback test passed'));
  if(state!==safePrevious && safePrevious==='running' && state==='failed')
   message(T('安全回滚测试失败，请查看日志','Safe rollback test failed; see logs'),true);
  safePrevious=state;
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
   E('h4',{},T('60 秒安全回滚测试（不影响真实网络）','60-second safe rollback dry run')),
   E('p',{},T('创建不影响正常流量的隔离 nft 表和策略路由规则，60 秒到期后撤销并核验。','Runs a 60-second server-side rollback rehearsal. No routing, nftables or client traffic changes. Continues if browser closes.')),
   safeResult=E('p',{},T('当前未运行安全回滚测试','No safe rollback test active')),
   safeProgress=E('progress',{'max':60,'value':0,'style':'width:100%;max-width:430px;display:block'}),
   E('button',{'class':'btn cbi-button-action','click':function(){
    run('safe-test-start').then(function(){message(T('已启动 60 秒安全测试','60-second dry run started'));return reload();}).catch(showError);
   }},T('运行 60 秒安全回滚测试','Start safe rollback dry run')),
   ' ',
   E('button',{'class':'btn cbi-button-negative','click':function(){
    run('safe-test-stop').then(reload).catch(showError);
   }},T('停止安全测试','Stop safe test')),
      E('h4',{},T('指定设备临时测试','Temporary single-client test')),
   E('p',{},T('单设备真实引流测试：仅对填写的客户端访问 1.1.1.1:443 引流，60 秒超时或旁路由掉线自动撤销；不对真实客户端做 SNAT。','One client real trial: only HTTPS to 1.1.1.1:443 is redirected and rolled back after 60 seconds or side-router failure. No SNAT.')),
   testInput,' ',
   E('button',{'class':'btn cbi-button','click':function(){run('set-client',[testInput.value.trim()]).then(reload).catch(showError);}},T('保存测试设备','Save test client')),
   ' ',
   E('button',{'class':'btn cbi-button','click':function(){
    ui.showModal(T('确认临时测试','Confirm temporary test'),[
     E('p',{},T('仅对填写的设备 IP 的 HTTPS 1.1.1.1:443 做真实引流，其他网站直连。测试设备可能遇到该目标连接中断；60 秒后由主路由后台撤销。请勿使用唯一的路由器管理设备测试。','Real forwarding is limited to the selected client and HTTPS 1.1.1.1:443. Other sites remain direct. The target may fail; the router watchdog rolls back at 60 seconds. Do not use your only admin device.')),
     E('button',{'class':'btn','click':ui.hideModal},T('取消','Cancel')),' ',
     E('button',{'class':'btn cbi-button-positive','click':function(){ui.hideModal();run('test-start').then(reload).catch(showError);}},T('开始测试','Start test'))
    ]);
   }},T('运行 60 秒单目标真实引流','Run 60-second single-target live test')),
   ' ',
   E('button',{'class':'btn cbi-button-negative','click':function(){run('test-stop').then(reload).catch(showError);}},T('撤销测试','Cancel test')),
   E('h4',{},T('浏览器网络试验（待重新设计）','Browser trial (not yet validated)')),
   E('p',{},T('请在上方填写当前这台设备的 IP，并用这台设备的浏览器执行。系统会临时引流、请求一个 HTTPS 地址、读取入口及转发出口计数，再立即撤销测试。成功请求也不代表代理节点出口已验证。','Set the IP of this browser device above. This tries HTTPS over temporary routing, reads ingress and forwarding counters, then rolls back immediately. It does not prove proxy-node egress.')),
   E('button',{'class':'btn cbi-button','disabled':true,'click':function(){
     var target=testInput.value.trim();
     if (!target) { message(T('请先填写当前浏览器设备的 IPv4 地址。','Enter this browser device IPv4 first.'),true); return; }
     var started=false, networkOK=false, packets=0, networkError='';
     run('set-client',[target])
      .then(function(){return run('test-start');})
      .then(function(){started=true;
       var controller=new AbortController();
       var timeout=setTimeout(function(){controller.abort();},8000);
       return fetch('https://1.1.1.1/cdn-cgi/trace?bypass_trial='+Date.now(),
         {mode:'no-cors',cache:'no-store',signal:controller.signal})
        .then(function(){networkOK=true;},function(e){networkError=String(e.message||e);})
        .then(function(){clearTimeout(timeout);});
      })
      .then(function(){return run('status');})
      .then(function(raw){packets=parse(raw).test_packets||'0';})
      .then(function(){
       return run('test-stop').then(function(){started=false;});
      })
      .then(function(){
       message(networkOK && Number(packets)>0?
         T('临时引流期间 HTTPS 请求成功，策略命中 '+packets+' 个包；已撤销临时规则。尚未证明 PassWall 节点实际代理。','HTTPS responded during trial, '+packets+' packets matched, temporary route withdrawn. Proxy-node egress remains unverified.'):
         T('未能完成验证：HTTPS '+(networkOK?'成功':'失败')+'，策略命中 '+packets+' 个包。临时规则已尝试撤销。','Trial inconclusive: HTTPS '+(networkOK?'OK':'failed')+', '+packets+' matched packets. Temporary rules withdrawal attempted.'),!(networkOK&&Number(packets)>0));
       return reload();
      })
      .catch(function(e){
       if(started) run('test-stop').then(reload).catch(showError);
       showError(e);
      });
   }},T('开始并自动撤销测试','Run trial and roll back')),
   E('h4',{},T('诊断','Diagnostics')),
   E('button',{'class':'btn cbi-button','click':function(){
    run('topology-audit').then(function(v){ui.showModal(T('单臂网络只读检查','Read-only topology audit'),[
      E('pre',{'style':'white-space:pre-wrap'},v),
      E('button',{'class':'btn cbi-button','click':ui.hideModal},T('关闭','Close'))
    ]);}).catch(showError);
   }},T('一键拓扑检查（不改变网络）','Safe topology audit')),
   ' ',
   E('button',{'class':'btn cbi-button','click':function(){run('preflight').then(function(v){message(v);}).catch(showError);}},T('查看诊断详情','Show diagnostics')),
   E('h4',{},T('运行日志','Event log')),
   E('button',{'class':'btn cbi-button-negative','click':function(){
    ui.showModal(T('清空运行日志','Clear event log'),[
     E('p',{},T('仅清空本插件运行日志，不会清除系统日志或修改路由配置。','Only this plugin event log will be cleared; system logs and routing are unchanged.')),
     E('button',{'class':'btn','click':ui.hideModal},T('取消','Cancel')),' ',
     E('button',{'class':'btn cbi-button-negative','click':function(){
      ui.hideModal();
      run('clear-logs').then(function(){events.textContent=T('暂无事件','No events');return reload();})
       .then(function(){message(T('运行日志已清空','Event log cleared'));}).catch(showError);
     }},T('确认清空','Confirm clear'))
    ]);
   }},T('清空运行日志','Clear event log')),
   events
  ]);
  renderSummary(data[0]);
  renderBoot(data[2]);
  lastStatus=data[0];
  poll.add(reload,5);
  poll.add(function(){
   if (safeState==='running' && safeRemaining>0) {safeRemaining--;paintSafeCountdown();}
  },1);
  return E('div',{},[
   E('h2',{},T('智能网络保护','Smart network protection')),
   E('p',{},T('旁路由异常时，尽可能保障网络正常访问。首次使用请从第一步开始。','Help keep the network connected if a bypass router fails. Start at step one.')),
   header,guide,bootBox,advanced,
   E('p',{},T('开发预览：目前不能保证旁路由整机故障时自动接管；高级测试通过前请勿手动解除保护限制。','Development preview: full failover is not yet validated. Do not bypass safety restrictions.'))
  ]);
 },
 handleSaveApply:null,handleSave:null,handleReset:null
});
