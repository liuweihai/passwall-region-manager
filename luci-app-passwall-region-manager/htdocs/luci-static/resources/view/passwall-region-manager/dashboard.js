'use strict';
'require view';
'require fs';
'require poll';
'require ui';

var TOOL = '/usr/libexec/prm-web';
var REGIONS = ['US', 'JP', 'HK', 'SG', 'TW', 'KR', 'ALL'];
var output, stat, logs, current;
function run(args) {
  return fs.exec(TOOL, args).then(function(r) {
    if (r.code !== 0) throw new Error(r.stderr || 'Command failed (' + r.code + ')');
    return r.stdout || '';
  });
}
function showError(e) { ui.addNotification(null, E('p', {}, String(e.message || e)), 'danger'); }
function line(text) { return E('pre', { 'style': 'white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto' }, text); }
function refresh() {
  return Promise.all([run(['state']), run(['latest'])]).then(function(r) {
    stat.textContent = (r[0] || '').trim();
    logs.textContent = r[1] || '暂无验证日志';
  }).catch(showError);
}
function action(args) {
  current.textContent = '正在读取...';
  return run(args).then(function(s) { current.textContent = s || '没有结果'; }).catch(showError);
}
return view.extend({
  load: function() { return Promise.all([run(['status']), run(['state']), run(['latest'])]); },
  render: function(data) {
    var selected = E('select', { 'class': 'cbi-input-select' }, REGIONS.map(function(c) {
      return E('option', { 'value': c }, c === 'ALL' ? '全部地区' : c);
    }));
    current = line(data[0] || '暂无信息');
    stat = E('strong', {}, (data[1] || '').trim());
    logs = line(data[2] || '暂无验证日志');
    output = E('div', {}, [
      E('h2', {}, 'PassWall 地区节点管理'),
      E('p', {}, '只读扫描、独立出口验证和运行日志；不会自动修改网关、DNS 或 PassWall 主节点。'),
      E('div', { 'class': 'cbi-section' }, [
        E('button', { 'class': 'btn cbi-button', 'click': function(){ action(['scan']); } }, '扫描候选节点'),
        ' ',
        E('button', { 'class': 'btn cbi-button', 'click': function(){ action(['status']); } }, '查看缓存与状态'),
        ' ',
        E('button', { 'class': 'btn cbi-button', 'click': function(){ action(['plan']); } }, '分流预览'),
        current
      ]),
      E('div', { 'class': 'cbi-section' }, [
        E('h3', {}, '出口国家验证'),
        selected, ' ',
        E('button', { 'class': 'btn cbi-button-action', 'click': function(){
          ui.showModal('开始验证', [
            E('p', {}, '验证会启动临时 Xray 实例，并产生网络请求。不会应用分流规则。'),
            E('div', { 'class': 'right' }, [
              E('button', { 'class': 'btn', 'click': ui.hideModal }, '取消'), ' ',
              E('button', { 'class': 'btn cbi-button-positive', 'click': function(){
                ui.hideModal();
                run(['start', selected.value]).then(refresh).catch(showError);
              } }, '开始')
            ])
          ]);
        } }, '开始验证'),
        E('p', {}, ['任务状态：', stat]),
        E('p', {}, '日志每 3 秒刷新，包含验证通过、超时及实际出口国家。'),
        logs
      ])
    ]);
    poll.add(refresh, 3);
    return output;
  },
  handleSaveApply: null,
  handleSave: null,
  handleReset: null
});
