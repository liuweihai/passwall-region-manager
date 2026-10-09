'use strict';
'require view';
'require fs';
'require poll';
'require ui';

var CMD = '/usr/libexec/bypass-failover-web', statusBox, logBox, testInfo, clientInput, proxyInput;
function zh() {
 // LuCI may report "auto" while its translated menus are already Chinese.
 var langs = [L.env.lang, document.documentElement.lang];
 for (var i = 0; i < langs.length; i++) {
  var language = String(langs[i] || '').toLowerCase().replace('_', '-');
  if (language.indexOf('zh') === 0) return true;
  if (language.indexOf('en') === 0) return false;
 }
 // Use the actual active LuCI translations instead of browser locale alone.
 var translated = [_('Save & Apply'), _('Status'), _('System')].join(' ');
 if (/[\u3400-\u9fff]/.test(translated)) return true;
 var menus = document.querySelector('header, nav, .mainmenu');
 if (menus && /状态|系统|服务|网络/.test(menus.textContent || '')) return true;
 return String(navigator.language || '').toLowerCase().indexOf('zh') === 0;
}
function t(cn, en) { return zh() ? cn : en; }
function call(arg, more) {
 return fs.exec(CMD, [arg].concat(more || [])).then(function(r) {
  if (r.code) throw new Error(localError(r.stderr || '') || t('请求失败', 'Request failed'));
  return r.stdout || '';
 });
}
var statusLabels = {
 mode:['运行模式','Mode'], state:['实际引流状态','Routing state'],
 daemon:['监控进程','Monitor process'], bypass:['旁路由地址','Bypass router'],
 lan:['局域网接口','LAN interface'], ipv6:['IPv6 管理','IPv6 management'],
 proxy_check:['代理出口检测配置','Proxy exit configuration'],
 forwarding_verified:['引流验证许可','Forwarding verified'],
 dns_strategy:['DNS 策略','DNS strategy'], ipv6_strategy:['IPv6 策略','IPv6 strategy'],
 notifications:['故障通知','Notifications'], proxy_endpoint:['代理检测地址','Proxy endpoint'],
 test:['单设备测试','Single-device test'], test_remaining:['剩余时间（秒）','Seconds remaining'],
 test_client:['测试设备 IP','Test device IP']
};
var stateLabels = {
 direct:['小米主路由直连','Direct through primary router'],
 auto:['自动容灾','Automatic failover'],
 bypass:['通过旁路由','Through bypass router'],
 running:['运行中','Running'], stopped:['已停止','Stopped'],
 configured:['已配置','Configured'], unconfigured:['未配置','Not configured'],
 disabled:['未启用','Disabled'], enabled:['已启用','Enabled'],
 'not-managed':['未接管','Not managed'],
 'primary-router':['保持主路由 DNS','Keep primary router DNS'],
 unchanged:['保持原有设置','Unchanged'],
 '0':['未验证，禁止自动引流','Not verified; automatic forwarding blocked'],
 '1':['已确认','Verified'], idle:['未运行','Idle']
};
function translateValue(key, value) {
 if ((key === 'mode' || key === 'state' || key === 'daemon' ||
      key === 'ipv6' || key === 'proxy_check' || key === 'notifications' ||
      key === 'dns_strategy' || key === 'ipv6_strategy' || key === 'forwarding_verified') &&
     stateLabels[value]) return t.apply(null, stateLabels[value]);
 return value;
}
function localizeStatus(raw) {
 return (raw || '').trim().split('\n').map(function(line) {
  var p = line.indexOf('=');
  if (p < 0) return line;
  var key = line.substring(0, p), value = line.substring(p + 1);
  return (statusLabels[key] ? t.apply(null, statusLabels[key]) : key) +
    '：' + translateValue(key, value);
 }).join('\n');
}
var preflightLabels = {
 config:['基础配置','Configuration'], base:['旁路由 Ping / DNS','Bypass Ping / DNS'],
 proxy:['真实代理出口','Real proxy exit'], forwarding:['引流安全验证','Forwarding safety check']
};
var preflightValues = {
 ok:['通过','Passed'], healthy:['正常','Healthy'], unhealthy:['异常或尚未配置','Unavailable or not configured'],
 blocked:['未验证，禁止启用','Not verified; blocked'], approved:['已确认','Approved']
};
function localizePreflight(raw) {
 return (raw || '').trim().split('\n').map(function(line) {
  var p = line.indexOf('=');
  if (p < 0) return line;
  var key = line.slice(0, p), value = line.slice(p + 1);
  return (preflightLabels[key] ? t.apply(null, preflightLabels[key]) : key) +
    '：' + (preflightValues[value] ? t.apply(null, preflightValues[value]) : value);
 }).join('\n');
}
function healthMessage(raw) {
 var result = (raw || '').trim();
 if (result === 'healthy')
  return t('检测通过：旁路由 Ping 和 DNS 均正常（不代表代理出口正常）。',
           'Passed: bypass router Ping and DNS respond (proxy exit not verified).');
 if (result === 'unhealthy')
  return t('检测失败：旁路由 Ping 或 DNS 不可用。',
           'Failed: bypass router Ping or DNS is unavailable.');
 return t('检测结果：', 'Check result: ') + result;
}
function proxyMessage(raw) {
 return (raw || '').trim() === 'proxy_healthy' ?
  t('真实代理出口检测通过。', 'Real proxy exit check passed.') :
  t('真实代理出口不可用或尚未配置检测端点。', 'Real proxy exit unavailable or check endpoint not configured.');
}
function localError(raw) {
 var err = (raw || '').trim();
 if (!zh()) return err;
 if (err.indexOf('forwarding path not verified') >= 0)
  return '尚未完成同网段转发验证，禁止启用自动容灾。';
 if (err.indexOf('real proxy health check failed') >= 0)
  return '真实代理出口检测失败，无法启用自动容灾。';
 if (err.indexOf('config invalid') >= 0)
  return '基础配置无效，未对网络进行更改。';
 return err;
}
function localizeLog(raw) {
 if (!raw) return t('尚无记录', 'No records yet');
 if (zh()) return raw;
 var translations = [
  ['用户选择直连', 'Direct mode selected by user'],
  ['服务停止，保持小米直连', 'Service stopped; primary router direct mode retained'],
  ['守护进程启动，安全默认直连', 'Monitor started; safe direct mode is default'],
  ['旁路由健康检查连续失败，已回退小米直连', 'Bypass health checks failed; switched to direct mode'],
  ['旁路由恢复稳定，已启用引流', 'Bypass recovered; forwarding enabled'],
  ['引流规则安装失败，继续直连', 'Forwarding setup failed; staying in direct mode'],
  ['用户开启自动模式', 'Automatic failover selected by user'],
  ['Webhook 通知发送失败', 'Webhook notification failed'],
  ['代理出口检测地址未配置或不是旁路由地址', 'Proxy endpoint not configured or invalid']
 ];
 return translations.reduce(function(s, pair) { return s.split(pair[0]).join(pair[1]); }, raw);
}
function error(e) {
 ui.addNotification(null, E('p', {}, localError(String(e.message || e))), 'danger');
}
function refresh() {
 return Promise.all([call('status'), call('logs')]).then(function(r) {
  statusBox.textContent = localizeStatus(r[0]);
  var ipMatch = r[0].match(/^test_client=(.*)$/m);
  if (ipMatch && clientInput && document.activeElement !== clientInput) clientInput.value = ipMatch[1];
  var epMatch = r[0].match(/^proxy_endpoint=(.*)$/m);
  if (epMatch && proxyInput && document.activeElement !== proxyInput) proxyInput.value = epMatch[1];
  logBox.textContent = localizeLog(r[1]);
 }).catch(error);
}
return view.extend({
 load: function() { return Promise.all([call('status'), call('logs')]); },
 render: function(data) {
  statusBox = E('pre', {'style':'white-space:pre-wrap'}, localizeStatus(data[0]));
  var testIp = (data[0].match(/^test_client=(.*)$/m) || ['', ''])[1];
  clientInput = E('input', {'class':'cbi-input-text','type':'text','placeholder':'192.168.1.123','value':testIp});
  var proxyEp = (data[0].match(/^proxy_endpoint=(.*)$/m) || ['', ''])[1];
  proxyInput = E('input', {'class':'cbi-input-text','type':'text','placeholder':'socks5h://192.168.1.2:1080','value':proxyEp});
  logBox = E('pre', {'style':'white-space:pre-wrap;max-height:320px;overflow:auto'}, localizeLog(data[1]));
  poll.add(refresh, 5);
  return E('div', {}, [
   E('h2', {}, t('旁路由智能容灾 · v0.2.0-dev', 'Bypass Router Failover · v0.2.0-dev')),
   E('p', {}, t('安装于小米主路由。当前仅管理 IPv4，默认直连。自动容灾需要真实代理出口与回程转发验证。',
      'Installed on the primary router. IPv4 only; direct mode by default. Auto mode requires proxy and forwarding validation.')),
   E('div', {'class':'cbi-section'}, [
    E('h3', {}, t('运行状态', 'Running status')), statusBox,
    E('button', {'class':'btn cbi-button', 'click':function(){
      call('preflight').then(function(v){ui.addNotification(null,E('pre',{},localizePreflight(v)));}).catch(error);
    }}, t('运行安全预检', 'Run safety preflight')),
    ' ',
    E('button', {'class':'btn cbi-button', 'click':function(){
      call('check-proxy').then(function(v){ui.addNotification(null,E('p',{},proxyMessage(v)));}).catch(error);
    }}, t('检测真实代理出口', 'Check real proxy exit')),
    ' ',
    E('button', {'class':'btn cbi-button', 'click':function(){
      call('check').then(function(v){ui.addNotification(null,E('p',{},healthMessage(v)));}).catch(error);
    }}, t('检查旁路由', 'Check bypass router')),
    ' ',
    E('button', {'class':'btn cbi-button-negative', 'click':function(){call('direct').then(refresh).catch(error);}},
       t('强制小米直连', 'Force direct mode')),
    ' ',
    E('button', {'class':'btn cbi-button-positive', 'click':function(){
      ui.showModal(t('确认启动自动容灾','Confirm automatic failover'), [
       E('p', {}, t('自动模式会修改运行中的 IPv4 策略路由。必须先验证代理出口和同网段回程，未验证时程序会拒绝启用。',
        'Auto mode changes active IPv4 policy routing. Proxy and same-subnet return paths must be validated first.')),
       E('div', {'class':'right'}, [
        E('button', {'class':'btn','click':ui.hideModal}, t('取消', 'Cancel')), ' ',
        E('button', {'class':'btn cbi-button-positive','click':function(){ui.hideModal();call('auto').then(refresh).catch(error);}},
          t('确认启动', 'Confirm'))
       ])
      ]);
    }}, t('启用自动容灾', 'Enable automatic failover'))
   ]),
   E('div', {'class':'cbi-section'}, [
    E('h3', {}, t('单设备安全测试（60 秒后自动撤销）', 'Single-client safety test (auto rollback after 60s)')),
    E('p', {}, t('旁路由 HTTP/SOCKS5 代理入口（必须已实际开放，仅填真实端口）：', 'Existing bypass HTTP/SOCKS5 proxy endpoint:')),
    proxyInput, ' ',
    E('button', {'class':'btn cbi-button', 'click':function(){call('set-proxy',[proxyInput.value.trim()]).then(refresh).catch(error);}}, t('保存检测入口','Save proxy endpoint')),

    E('p', {}, t('仅选择一台测试设备，其他设备保持主路由直连。需要先通过真实代理出口检测；禁止用全屋设备执行首次测试。',
     'Route one test device only, keeping others direct. A working real-proxy endpoint is required.')),
    E('label', {}, t('测试设备 IPv4 地址：', 'Test device IPv4: ')), clientInput, ' ',
    E('button', {'class':'btn cbi-button', 'click':function(){
      call('set-client', [clientInput.value.trim()]).then(refresh).catch(error);
    }}, t('保存测试设备', 'Save test device')), ' ',
    E('button', {'class':'btn cbi-button-positive', 'click':function(){
      ui.showModal(t('确认临时引流测试', 'Confirm temporary routing test'), [
       E('p', {}, t('只对选定 IPv4 地址安装临时策略路由。60 秒自动撤销；已有连接可能中断。开始前务必确保有独立的主路由管理入口。',
        'A temporary route applies to one IPv4 address for 60 seconds. Existing connections may reset.')),
       E('div', {'class':'right'}, [
        E('button', {'class':'btn', 'click':ui.hideModal}, t('取消','Cancel')), ' ',
        E('button', {'class':'btn cbi-button-positive', 'click':function(){
          ui.hideModal(); call('test-start').then(function(){ refresh(); ui.addNotification(null,E('p',{},t('单设备测试已启动，60 秒后自动撤销。','Test started; automatic rollback in 60 seconds.'))); }).catch(error);
        }}, t('开始 60 秒测试','Start 60s test'))
       ])
      ]);
    }}, t('开始单设备测试','Start single-client test')), ' ',
    E('button', {'class':'btn cbi-button-negative', 'click':function(){
      call('test-stop').then(refresh).catch(error);
    }}, t('立即撤销测试','Stop and roll back'))
   ]),
   E('div', {'class':'cbi-section'}, [E('h3', {}, t('最近运行日志', 'Recent logs')), logBox]),
   E('p', {}, t('开发预览：IPv6 保留现状，DNS 保持主路由配置；通知和代理检测需要额外配置。未验证回程时禁止自动引流。',
     'Development preview: IPv6 unchanged, DNS kept on primary router. Alerts and proxy checks require configuration. Auto forwarding requires return-path validation.'))
  ]);
 },
 handleSaveApply:null, handleSave:null, handleReset:null
});
