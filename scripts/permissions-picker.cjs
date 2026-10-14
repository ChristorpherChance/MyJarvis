const fs = require('node:fs/promises');
const path = require('node:path');

// Serialized into the standalone HTML; all outputs are local downloads.
function initializePicker() {
  const byId = id => document.getElementById(id);
  let selected = 'operator', body = '', filename = '', inventoryBody = '', inventoryFilename = '', valid = false, inventoryValid = false;
  const suggestions = { login: 'jarvis-user', diagnostics: 'jarvis-watch', operator: 'jarvis-ops', 'admin-password': 'jarvis-admin', 'admin-full': 'jarvis-admin' };
  const custom = () => byId('perm-server').value === 'custom';
  function serverValue() {
    return normalizePermissionServer(custom() ? {
      id: byId('perm-id').value.trim(), host: byId('perm-host').value.trim(),
      port: Number(byId('perm-port').value), hostname: byId('perm-hostname').value.trim(),
      user: byId('perm-admin').value.trim(), fingerprint: byId('perm-fingerprint').value.trim()
    } : PERMISSION_DATA.servers.find(row => row.id === byId('perm-server').value));
  }
  function update() {
    const isCustom = custom();
    byId('perm-custom').hidden = !isCustom;
    byId('perm-unit').disabled = selected !== 'operator';
    byId('perm-unit-help').textContent = selected === 'operator' ? '填服务器已有的systemd服务名，含.service，如jarvis-platform.service；它必须以非root账号运行。' : '当前权限档不需要填写管理服务。';
    document.querySelectorAll('[data-profile]').forEach(button => button.setAttribute('aria-checked', String(button.dataset.profile === selected)));
    byId('perm-status').textContent = '';
    byId('perm-snapshot').textContent = isCustom ? '手动填写的服务器尚未核验；本页面不会连接或检测该机器。' : '';
    inventoryValid = false; inventoryBody = ''; inventoryFilename = '';
    try {
      const server = serverValue(), user = byId('perm-user').value.trim();
      const unit = selected === 'operator' ? byId('perm-unit').value.trim() : 'jarvis-platform.service';
      if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(user) || user === 'root') throw Error('授权账号需为1–32位小写字母、数字、短横线或下划线，以小写字母或下划线开头，不填root。');
      if (selected === 'operator' && !/^[a-zA-Z0-9][a-zA-Z0-9_.@:-]{0,120}\.service$/.test(unit)) throw Error('管理服务填写完整服务名，如jarvis-platform.service，不填网址、路径或启动命令。');
      const plan = permissionPlan({ user, profile: selected, unit });
      const snapshot = isCustom ? null : PERMISSION_DATA.checks.find(row => row.id === server.id);
      if (!isCustom) byId('perm-snapshot').textContent = '已核验 ' + new Date(PERMISSION_DATA.at).toLocaleString('zh-CN') + '：' + server.user + ' · ' + (snapshot?.ok && snapshot.fullUnattendedRoot ? '已有完整免密sudo权限' : '实际权限请重新审计');
      body = renderInstallerTemplate(PERMISSION_DATA.template, server, plan);
      filename = 'permissions-' + server.id + '-' + user + '-' + selected + '.sh'; valid = true;
      byId('perm-script').textContent = body;
      byId('perm-target').textContent = '目标：' + server.id + ' · ' + server.host + ':' + server.port + ' · 主机名 ' + server.hostname + ' · 授权账号 ' + user;
      byId('perm-apply').textContent = 'bash ' + filename + '\n' + 'sudo bash ' + filename + ' --apply' + (byId('perm-create').checked ? ' --create-user' : '');
      let notice = PROFILES.find(row => row.id === selected).scope + '。';
      if (user === server.user && snapshot?.fullUnattendedRoot && selected !== 'admin-full') notice += ' 当前账号已有完整免密权限，这一档不撤销旧授权；需要受限访问或要求密码时请使用独立账号和独立密钥。';
      else if (selected === 'admin-full') notice += ' 该账号可以用sudo取得完整root权限。';
      else if (selected === 'admin-password') notice += ' 需由管理员为账号设置密码；还要检查其他免密规则及认证缓存。';
      else notice += ' 该账号的现有权限仍需在应用后检查。';
      if (selected === 'operator') notice += ' 应用前须安装指定服务；服务器管理员检查其运行账号和服务文件权限。';
      byId('perm-notice').textContent = notice;
      byId('perm-notice').className = 'perm-notice' + (selected === 'admin-full' || (user === server.user && snapshot?.fullUnattendedRoot && selected !== 'admin-full') ? ' warn' : '');
      try {
        const inventory = permissionConnectionInventory(server, user);
        inventoryBody = JSON.stringify(inventory, null, 2) + '\n';
        inventoryFilename = 'servers-' + server.id + '-' + user + '.json'; inventoryValid = true;
        byId('perm-inventory-note').textContent = '连接清单将登录授权账号 ' + user + '；主机指纹必须来自服务器本机或其他可信渠道。';
        byId('perm-node').textContent = 'node scripts/server-permissions.mjs prepare --inventory ' + inventoryFilename + ' --output artifacts/server-permissions/' + server.id + '-' + user + '-' + selected + ' --server ' + server.id + ' --profile ' + selected + ' --user ' + user + (selected === 'operator' ? ' --unit ' + unit : '');
        byId('perm-access').textContent = 'node scripts/server-access.mjs prepare --inventory ' + inventoryFilename + ' --output artifacts/server-access/office-hp-' + user + ' --client-id office-hp --identity-dir ~/.ssh/' + user + '\n' + 'node scripts/server-access.mjs verify --output artifacts/server-access/office-hp-' + user;
      } catch (error) {
        byId('perm-inventory-note').textContent = error.message + ' 权限脚本仍可下载并在服务器本机预览。';
        byId('perm-node').textContent = '权限脚本可直接下载，无需连接服务器。补齐可信主机指纹后，可下载连接清单并使用本机工具生成。';
        byId('perm-access').textContent = '补齐可信主机指纹后显示SSH授权包的生成命令。';
      }
    } catch (error) {
      valid = false; body = ''; filename = '';
      byId('perm-notice').textContent = error.message; byId('perm-notice').className = 'perm-notice warn';
      byId('perm-target').textContent = '';
      byId('perm-apply').textContent = '请按提示填写服务器、授权账号与服务信息。';
      byId('perm-script').textContent = ''; byId('perm-node').textContent = '';
      byId('perm-access').textContent = ''; byId('perm-inventory-note').textContent = '补齐有效信息后生成连接清单。';
    }
    byId('perm-download').disabled = !valid; byId('perm-copy').disabled = !valid;
    byId('perm-inventory').disabled = !inventoryValid;
  }
  document.querySelectorAll('[data-profile]').forEach(button => button.addEventListener('click', () => { selected = button.dataset.profile; update(); }));
  ['perm-server', 'perm-user', 'perm-unit', 'perm-create', 'perm-id', 'perm-host', 'perm-port', 'perm-hostname', 'perm-admin', 'perm-fingerprint'].forEach(id => byId(id).addEventListener('input', update));
  byId('perm-existing').addEventListener('click', () => {
    byId('perm-user').value = custom() ? byId('perm-admin').value.trim() : PERMISSION_DATA.servers.find(row => row.id === byId('perm-server').value).user;
    byId('perm-create').checked = false; update();
  });
  byId('perm-dedicated').addEventListener('click', () => { byId('perm-user').value = suggestions[selected]; byId('perm-create').checked = true; update(); });
  function download(content, name) {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  byId('perm-download').addEventListener('click', () => { if (!valid) return; download(body, filename); byId('perm-status').textContent = '脚本已生成；服务器权限尚未改变。'; });
  byId('perm-inventory').addEventListener('click', () => { if (!inventoryValid) return; download(inventoryBody, inventoryFilename); byId('perm-status').textContent = '连接清单已生成，不含密码或私钥；它不会自动授权登录。'; });
  byId('perm-copy').addEventListener('click', async () => {
    if (!valid) return;
    const text = byId('perm-apply').textContent;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const box = document.createElement('textarea'); box.value = text; document.body.appendChild(box); box.select();
        const copied = document.execCommand('copy'); box.remove(); if (!copied) throw Error('copy');
      }
      byId('perm-status').textContent = '应用命令已复制。';
    } catch { byId('perm-status').textContent = '请选中上方命令复制。'; }
  });
  update();
}

module.exports = async function permissionsPicker(html) {
  const { PROFILES, browserRendererSource } = await import('./server-permissions.mjs');
  const { parseInventory } = await import('./server-access.mjs');
  const inventory = JSON.parse(await fs.readFile(path.join(__dirname, '../config/servers.example.json'), 'utf8'));
  inventory.servers = parseInventory(inventory);
  const template = await fs.readFile(path.join(__dirname, 'install-server-permissions.sh'), 'utf8');
  const audit = JSON.parse(await fs.readFile(path.join(__dirname, '../artifacts/server-permissions-qa/permissions.json'), 'utf8'));
  const data = JSON.stringify({ servers: inventory.servers, template, checks: audit.checks.map(({ id, ok, fullUnattendedRoot }) => ({ id, ok, fullUnattendedRoot })), at: audit.at }).replaceAll('<', '\\u003c');
  const cards = PROFILES.map(row => `<button type="button" role="radio" aria-checked="${row.id === 'operator'}" data-profile="${row.id}"><b>${row.name}</b><span>${row.scope}</span></button>`).join('');
  const panel = `<style>
.permission-picker{margin:26px 0;padding:25px;border:1px solid #365264;border-radius:16px;background:linear-gradient(145deg,#122836,#0d1e2b)}.permission-picker h3{margin:0 0 8px;font-size:20px}.perm-sub{margin:0 0 20px;font-size:13px}.perm-profiles{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.perm-profiles button{font:inherit;text-align:left;color:#c6d9e2;background:#102230;border:1px solid #345363;border-radius:10px;padding:14px 12px;cursor:pointer}.perm-profiles button[aria-checked=true]{border-color:#8be5ec;background:#183f4d;box-shadow:0 0 0 1px #8be5ec}.perm-profiles b{font-size:14px;display:block;color:#a9eff3}.perm-profiles span{font-size:11px;display:block;line-height:1.7;margin-top:8px}.perm-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:22px 0 10px}.perm-form label{font-size:12px;color:#b4cbd5}.perm-form input,.perm-form select{box-sizing:border-box;width:100%;margin-top:7px;background:#091721;color:#dceaf0;border:1px solid #416171;border-radius:7px;padding:10px;font:14px 'Segoe UI','Microsoft YaHei',sans-serif}.perm-form input:disabled{opacity:.5}.perm-help{display:block;font-size:11px;line-height:1.7;color:#94b2c2;margin-top:7px}.perm-custom{padding:16px;border:1px solid #2f5266;border-radius:9px;background:#0b1b28}.perm-custom[hidden]{display:none}.perm-presets,.perm-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.perm-presets button,.perm-actions button{font:13px 'Segoe UI','Microsoft YaHei',sans-serif;border:1px solid #436171;color:#bdd9e4;background:#132c3a;padding:8px 12px;border-radius:7px;cursor:pointer}.perm-actions button:first-child{background:#85dfe8;color:#09202b;border-color:#85dfe8;font-weight:600}.perm-actions button:disabled{opacity:.4;cursor:default}.perm-presets label{font-size:12px;color:#b4c7d1}.perm-snapshot,.perm-target{font-size:12px;color:#86d4db;margin:15px 0 5px;overflow-wrap:anywhere}.perm-notice{font-size:13px;border-left:3px solid #8be5ec;padding:10px 14px;background:#102330}.perm-notice.warn{border-color:#ffc78a;color:#ffe2bb}.permission-picker pre{margin:12px 0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.permission-picker details{margin:18px 0;color:#b5d0dc;font-size:13px}.permission-picker summary{cursor:pointer}.permission-picker details pre{max-height:350px;overflow:auto}.perm-status{font-size:12px;color:#8be5ec}.perm-actions{margin-top:15px}.permission-picker small{display:block;margin-top:10px;color:#93afbd;font-size:11px}.perm-guide{border-top:1px solid #29414e;padding-top:15px}.perm-guide li{font-size:12px;line-height:1.8}.perm-guide p{font-size:12px}.permission-picker code{white-space:normal}@media(max-width:850px){.perm-profiles{grid-template-columns:repeat(2,minmax(0,1fr))}.perm-form{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:500px){.permission-picker{padding:16px}.perm-form{grid-template-columns:1fr}}
</style>
<section class="permission-picker" aria-label="权限方案选择器">
<h3>选择服务器权限</h3><p class="perm-sub">选已有服务器，或手动填写新服务器。页面只生成方案，不会连接服务器或应用权限。适用于Linux；应用运维档需要systemd。</p>
<div class="perm-profiles" role="radiogroup" aria-label="权限档案">${cards}</div>
<div class="perm-form">
<label>服务器<select id="perm-server">${inventory.servers.map(row => `<option value="${row.id}"${row.id === '112' ? ' selected' : ''}>${row.id} · ${row.host}</option>`).join('')}<option value="custom">手动填写其他服务器…</option></select><span class="perm-help">已有机器可直接选；新i3或其他Linux服务器选手动填写。</span></label>
<label>授权账号（服务器上）<input id="perm-user" value="jarvis-ops" autocomplete="off" maxlength="32" aria-describedby="perm-user-help"><span class="perm-help" id="perm-user-help">被授予权限的Linux账号，不是本机Windows用户名或家庭成员。1–32位小写字母、数字、-、_，以字母或_开头，不填root。</span></label>
<label>管理服务<input id="perm-unit" value="jarvis-platform.service" autocomplete="off" aria-describedby="perm-unit-help"><span class="perm-help" id="perm-unit-help"></span></label>
</div>
<div class="perm-form perm-custom" id="perm-custom" hidden>
<label>服务器编号<input id="perm-id" value="i3-backup" autocomplete="off" maxlength="64"><span class="perm-help">自定标识，如i3-backup；字母、数字、-、_，开头用字母或数字。清单内须唯一。</span></label>
<label>IP地址或域名<input id="perm-host" placeholder="192.168.10.120" autocomplete="off" maxlength="253"><span class="perm-help">填实际地址。不要加http://、端口或路径；IPv6不加方括号。</span></label>
<label>SSH端口<input id="perm-port" type="number" min="1" max="65535" value="22"><span class="perm-help">一般填22；改过SSH端口则填实际值。</span></label>
<label>实际主机名<input id="perm-hostname" placeholder="粘贴服务器执行hostname的结果" autocomplete="off" maxlength="253"><span class="perm-help">用于应用时核对目标机器。IP变化可更新地址，主机名仍按实际填写。</span></label>
<label>现有管理账号<input id="perm-admin" value="superopen" autocomplete="off" maxlength="32"><span class="perm-help">服务器已有的普通Linux账号，如ubuntu或superopen。应用脚本时需由拥有sudo权限的管理员执行。</span></label>
<label>ED25519主机指纹<input id="perm-fingerprint" placeholder="SHA256:…（下载连接清单时必填）" autocomplete="off" maxlength="50"><span class="perm-help">取自服务器本机。只生成权限脚本可留空；SSH连接清单必须有真实可信指纹。</span></label>
</div>
<div class="perm-presets"><button type="button" id="perm-existing">沿用现有管理账号</button><button type="button" id="perm-dedicated">使用独立账号</button><label><input type="checkbox" id="perm-create" checked> 账号不存在时创建</label></div>
<small>创建的是所选服务器上的普通账号；不会设置密码、授权SSH公钥、创建服务或部署项目。需密码档须另由管理员设置账号密码。</small>
<p class="perm-snapshot" id="perm-snapshot"></p><p class="perm-notice" id="perm-notice" aria-live="polite"></p>
<b style="font-size:13px;color:#d0e2ea">在目标服务器上应用方案</b><p class="perm-target" id="perm-target"></p><pre id="perm-apply"></pre>
<div class="perm-actions"><button type="button" id="perm-download">下载权限脚本</button><button type="button" id="perm-copy">复制应用命令</button><button type="button" id="perm-inventory">下载连接清单</button><span class="perm-status" id="perm-status" role="status"></span></div>
<small id="perm-inventory-note"></small>
<details class="perm-guide" open><summary>新服务器、新管理电脑怎么用</summary>
<ol><li><b>新服务器：</b>在服务器执行下方信息查询，选“手动填写”，将真实信息填入。下载权限脚本，交给现有管理员在目标服务器先预览，再应用。</li><li><b>新管理电脑：</b>目标服务器填它要访问的服务器，授权账号填它将登录的Linux账号。同账号无需重新授予sudo，但每台电脑都要生成自己的SSH密钥并授权公钥。</li><li><b>SSH登录：</b>下载连接清单，放在项目目录。在新电脑生成公钥包，将生成的authorize-编号.sh交给管理员按目标账号执行，之后再验证连接。不要复制旧电脑的私钥或含绝对路径的ssh-config。</li></ol>
<pre>whoami\nhostname\nssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256\nsystemctl list-unit-files --type=service\nsystemctl show jarvis-platform.service --property=User --property=FragmentPath</pre>
<p>上面命令在Linux服务器执行。服务名从列表选择，最后一行替换为实际服务名。jarvis-platform.service只是预定示例，目前尚未部署；Docker容器名、网页地址和项目目录不能直接填这里。此版本每个账号管理一个指定服务，更换服务会替换本工具此前管理的服务授权。</p>
<b>在新管理电脑生成SSH公钥包</b><pre id="perm-access"></pre>
<p>office-hp换成这台电脑的标识，例如home-pc或lenovo；同一组命令保持一致。新账号的公钥安装方式见下方文档。生成工具需要Node.js和OpenSSH；HTML本身可离线使用。</p>
</details>
<details><summary>查看权限脚本内容</summary><pre id="perm-script"></pre></details>
<details><summary>通过本机工具生成同一权限方案</summary><p>先下载连接清单并放入项目目录，再执行下方命令。</p><pre id="perm-node"></pre></details>
</section>`;
  const client = `<script>\n${browserRendererSource().replaceAll('</script', '<\\/script')}\nconst PERMISSION_DATA=${data};\n(${initializePicker.toString()})();\n</script>`;
  return html.replace(/<h1[^>]*>[^]*?<\/h1>/, match => match + panel).replace('</main></html>', () => '</main>' + client + '</html>');
};
