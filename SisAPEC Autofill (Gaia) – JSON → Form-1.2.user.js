// ==UserScript==
// @name         SisAPEC Autofill (Gaia) – JSON → Form
// @namespace    tulio.sisapec.autofill.gaia
// @version      1.2
// @description  Preenche SisAPEC a partir de um JSON canônico por atalho (Ctrl+Alt+S). Log em Ctrl+Alt+L. Preview em Shift+Ctrl+Alt+S.
// @match        https://app.sisapec.com/*
// @match        https://*.sisapec.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ================= CONFIG =================

  // Campos obrigatórios conhecidos do SisAPEC
 const requiredFields = [
  "Nome completo",
  "Sexo biológico",
  "Gênero",
  "CPF",
  "Data de Nascimento",
  "Estado Civil",
  "Etnia",
  "Religião",
  "Escolaridade",
  "Ocupação",
  "Bairro",
  "Cidade",
  "UF",
  "País"
];

  // Aliases de rótulos (ajustar conforme necessário)
  const labelAliases = {
    "Cartão SUS": ["cns", "cartao sus", "cartão do sus"],
    "E-mail": ["email", "e mail"],
    "Sexo biológico": ["sexo", "sexo biologico"],
    "Gênero": ["genero", "identidade de genero"],
    "Pressão arterial (mmHg)": ["pressao arterial", "pa", "pressão arterial"],
    "Frequência cardíaca (bpm)": ["fc", "frequencia cardiaca"],
    "Frequência respiratória (irpm)": ["fr", "frequencia respiratoria", "respiração"],
    "Temperatura (°C)": ["temperatura", "temp"],
    "Rua ou Avenida": ["logradouro", "endereco", "endereço", "rua", "avenida", "av"],
    "Número": ["numero", "número", "nº", "num"],
    "Bairro": ["bairro", "distrito"],
    "Cidade": ["cidade", "municipio", "município"],
    "UF": ["estado", "uf"],
    "País": ["pais", "país"],
    "Data de nascimento": ["nascimento", "data de nasc", "d.nasc", "dn", "data nasc"]
  };

  // Aliases para valores de select/radio
  const selectValueAliases = {
    "sim": ["sim", "s", "true", "1", "positivo"],
    "nao": ["não", "nao", "n", "false", "0", "negativo", "não sei", "desconhece"],
    "masculino": ["masculino","m","homem"],
    "feminino": ["feminino","f","mulher"],
    "outro": ["outro","nao binario","não binário","nb","indefinido","prefiro não responder","prefiro não dizer","indeterminado"]
  };

  // ================= UI (overlay) =================
  const ui = (() => {
    const box = document.createElement('div');
    Object.assign(box.style, {
      position: 'fixed', inset: 'auto 12px 12px auto', zIndex: 999999,
      width: '460px', background: 'rgba(20,20,24,.97)', color: '#fff',
      borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,.35)',
      border: '1px solid rgba(255,255,255,.08)', display: 'none'
    });

    const head = document.createElement('div');
    head.textContent = 'SisAPEC Autofill (Gaia)';
    Object.assign(head.style, { padding: '10px 12px', font: '600 14px/1.2 Inter,system-ui,monospace' });

    const ta = document.createElement('textarea');
    Object.assign(ta.style, { width: '100%', height: '180px', boxSizing:'border-box',
      border:'1px solid rgba(255,255,255,.15)', background:'#111', color:'#fff',
      borderRadius:'10px', padding:'10px 12px', outline:'none', resize:'vertical' });
    ta.placeholder = 'Cole aqui o JSON canônico SisAPEC...';

    const row = document.createElement('div');
    Object.assign(row.style, { display:'flex', gap:'8px', padding:'10px 12px' });

    const btnFill = document.createElement('button');
    btnFill.textContent = 'Preencher';
    styleBtn(btnFill);

    const btnPreview = document.createElement('button');
    btnPreview.textContent = 'Preview';
    styleBtn(btnPreview);

    const btnClose = document.createElement('button');
    btnClose.textContent = 'Fechar';
    styleBtn(btnClose, true);

    row.append(btnFill, btnPreview, btnClose);

    const logBox = document.createElement('div');
    Object.assign(logBox.style, {
      padding: '10px 12px', borderTop:'1px solid rgba(255,255,255,.08)',
      maxHeight:'35vh', overflow:'auto', font:'12px/1.4 ui-monospace,Menlo,Consolas,monospace',
      background:'#0b0b0c'
    });

    box.append(head, ta, row, logBox);
    document.body.appendChild(box);

    btnClose.onclick = () => box.style.display = 'none';

    return {
      el: box,
      textarea: ta,
      logBox,
      show() { box.style.display = 'block'; },
      hide() { box.style.display = 'none'; },
      log(...a){ logBox.innerHTML += a.map(String).join(' ') + '<br>'; logBox.scrollTop = logBox.scrollHeight; },
      clearLog(){ logBox.innerHTML = ''; },
      onFill: (fn)=> btnFill.onclick = fn,
      onPreview: (fn)=> btnPreview.onclick = fn
    };

    function styleBtn(b, ghost=false) {
      Object.assign(b.style, {
        flex:'1', padding:'10px 12px', borderRadius:'10px', cursor:'pointer',
        border: ghost ? '1px solid rgba(255,255,255,.25)' : '1px solid transparent',
        background: ghost ? 'transparent' : '#2563eb', color: ghost ? '#fff' : '#fff',
        font: '600 13px/1 Inter,system-ui,Segoe UI'
      });
      b.onmouseenter = () => b.style.opacity = '.92';
      b.onmouseleave = () => b.style.opacity = '1';
    }
  })();

  // ================= Helpers =================
  const norm = (s) => (s||'').toString()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ').trim().toLowerCase();

  function visible(el){
    if(!el) return false;
    const r = el.getBoundingClientRect();
    return r.width>0 && r.height>0;
  }

  function aliasHit(qText, labelText){
    const qn = norm(qText);
    const ln = norm(labelText);
    if (ln === qn) return true;
    if (ln.includes(qn) || qn.includes(ln)) return true;

    // tenta por aliases
    const aliases = labelAliases[qText] || [];
    for (const a of aliases) {
      const an = norm(a);
      if (ln === an || ln.includes(an) || an.includes(ln)) return true;
    }
    return false;
  }

  function isRequiredField(question){
    return requiredFields.some(r => question.toLowerCase() === r.toLowerCase());
  }

  function normalizeSelectValue(v){
    const V = norm(v);
    for (const [canon, arr] of Object.entries(selectValueAliases)) {
      for (const alt of arr) if (V === norm(alt)) return canon;
      if (arr.some(a => V.includes(norm(a)))) return canon;
    }
    return v;
  }

  function parseDateMaybe(v){
    const m = String(v).match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    return m ? {d:m[1].padStart(2,'0'), m:m[2].padStart(2,'0'), y:m[3]} : null;
  }

  function parsePA(v){
    const m = String(v).match(/(\d{2,3})\s*[xX\/]\s*(\d{2,3})/);
    return m ? {sistolica:m[1], diastolica:m[2]} : null;
  }

  function inSameGroup(labelEl){
    return labelEl.closest('div, fieldset, .row, .col, .form-group') || document;
  }

  function findFieldByLabel(qText){
    const labels = Array.from(document.querySelectorAll('label'));
    let best = null, bestScore = 0;
    for (const lb of labels) {
      const txt = lb.textContent || '';
      if (!txt.trim()) continue;
      if (!aliasHit(qText, txt)) continue;
      const score = 100 - Math.abs(norm(txt).length - norm(qText).length);
      if (score > bestScore) { bestScore = score; best = lb; }
    }
    if (!best) return null;

    const forId = best.getAttribute('for');
    let field = null;
    if (forId) field = document.getElementById(forId);

    if (!field) {
      const grp = inSameGroup(best);
      field = grp.querySelector('input, select, textarea');
    }

    return {label: best, field};
  }

  function setText(el, value){
  // limpa antes
  el.value = "";
  el.dispatchEvent(new Event('input', {bubbles:true}));

  // insere valor
  el.value = String(value);

  // dispara eventos que o SisAPEC provavelmente espera
  el.dispatchEvent(new Event('input', {bubbles:true}));
  el.dispatchEvent(new Event('change', {bubbles:true}));
  el.dispatchEvent(new Event('blur', {bubbles:true}));
  el.dispatchEvent(new KeyboardEvent('keydown', {bubbles:true, key: 'Enter'}));
  el.dispatchEvent(new KeyboardEvent('keyup', {bubbles:true, key: 'Enter'}));
}


  function setSelect(el, value){
    const target = norm(value);
    let ok = false;
    for (const opt of Array.from(el.options)) {
      const on = norm(opt.textContent);
      if (on === target || on.includes(target) || target.includes(on)) {
        el.value = opt.value; ok = true; break;
      }
      const canon = normalizeSelectValue(value);
      if (!ok && norm(opt.textContent) === norm(canon)) { el.value = opt.value; ok = true; break; }
    }
    if (!ok && el.options.length) el.value = el.options[0].value;
    el.dispatchEvent(new Event('change', {bubbles:true}));
  }

  function setRadioOrCheckboxGroup(anyInGroup, value){
    const V = norm(String(value));
    const name = anyInGroup.getAttribute('name');
    const group = name ? document.querySelectorAll(`input[name="${CSS.escape(name)}"]`) : [anyInGroup];

    if (Array.isArray(value)) {
      let hits = 0;
      for (const x of group) {
        const l = x.closest('label') || document.querySelector(`label[for="${x.id}"]`);
        const txt = norm(l?.textContent || '');
        if (value.map(v=>norm(v)).some(vv => txt.includes(vv))) {
          if (!x.checked) x.click();
          hits++;
        }
      }
      return hits>0;
    }

    const canon = normalizeSelectValue(V);
    for (const x of group) {
      const l = x.closest('label') || document.querySelector(`label[for="${x.id}"]`);
      const txt = norm(l?.textContent || '');
      if (txt.includes(canon) ||
          (canon.startsWith('s') && txt.includes('sim')) ||
          (canon.startsWith('n') && txt.includes('nao'))) {
        if (!x.checked) x.click();
        return true;
      }
    }
    return false;
  }

  function fillDateGroup(groupEl, v){
    const dm = parseDateMaybe(v);
    if (!dm) return false;
    const ins = Array.from(groupEl.querySelectorAll('input'));
    if (ins.length < 2) return false;
    const dia = ins.find(i => /dia|dd/i.test(i.name+i.placeholder || '')) || ins[0];
    const mes = ins.find(i => /mes|mm/i.test(i.name+i.placeholder || '')) || ins[1] || ins[0];
    const ano = ins.find(i => /ano|yyyy|aaaa/i.test(i.name+i.placeholder || '')) || ins[2] || ins[1];

    if (dia) setText(dia, dm.d);
    if (mes) setText(mes, dm.m);
    if (ano) setText(ano, dm.y);
    return true;
  }

  function maybeSplitPA(groupEl, v){
    const pa = parsePA(v);
    if (!pa) return false;
    const ins = Array.from(groupEl.querySelectorAll('input'));
    if (ins.length < 2) return false;
    const nums = ins.filter(i => !isNaN(Number(i.value || '')) || /number|tel|text/i.test(i.type));
    if (nums.length >= 2) {
      setText(nums[0], pa.sistolica);
      setText(nums[1], pa.diastolica);
      return true;
    }
    return false;
  }

  function fillOne(question, answer, preview=false){
    const found = findFieldByLabel(question);
    if (!found || !found.field) return {ok:false, msg:'campo não encontrado'};
    const {label, field} = found;

    if (!visible(field)) return {ok:false, msg:'campo invisível/fora da área'};

    const group = inSameGroup(label);
    const tag = field.tagName.toLowerCase();
    const type = (field.getAttribute('type')||'text').toLowerCase();

    if (!preview && maybeSplitPA(group, answer)) return {ok:true, msg:'PA em 2 campos (sist/diast) OK'};

    if (Array.isArray(answer) && type === 'checkbox') {
      if (preview) return {ok:true, msg:'[preview] checkboxes múltiplos'};
      const done = setRadioOrCheckboxGroup(field, answer);
      return {ok:done, msg: done ? 'checkbox múltiplo OK' : 'falha checkbox múltiplo'};
    }

    if (type === 'radio' || type === 'checkbox') {
      if (preview) return {ok:true, msg:'[preview] radio/checkbox'};
      const done = setRadioOrCheckboxGroup(field, answer);
      return {ok:done, msg: done ? 'radio/checkbox OK' : 'falha radio/checkbox'};
    }

    if (tag === 'select') {
      if (preview) return {ok:true, msg:'[preview] select'};
      setSelect(field, answer);
      return {ok:true, msg:'select OK'};
    }

    if (!preview && fillDateGroup(group, answer)) return {ok:true, msg:'data (dd/mm/aaaa) OK'};

    if (preview) return {ok:true, msg:'[preview] texto'};
    setText(field, answer);
    return {ok:true, msg:'texto OK'};
  }

  function flattenPayload(data){
    const out = [];
    for (const [section, qa] of Object.entries(data||{})) {
      for (const [q, a] of Object.entries(qa||{})) {
        let val = a;
        if (val === null || val === undefined || val === '') {
          if (isRequiredField(q)) {
            val = "Prefiro não responder";
          } else {
            continue;
          }
        }
        out.push({section, question:q, answer:val});
      }
    }
    return out;
  }

  function runAutofill(json, preview=false){
    ui.clearLog();
    ui.log(`Iniciando ${preview?'PREVIEW':'preenchimento'}…`);
    const rows = flattenPayload(json);
    let ok=0, total=0;
    for (const r of rows) {
      total++;
      const res = fillOne(r.question, r.answer, preview);
      if (res.ok) ok++;
      ui.log(`• [${r.section}] ${r.question} → ${res.msg}`);
    }
    ui.log(`Concluído: ${ok}/${total} campos.`);
  }

  async function openAndPaste(preview=false){
    ui.show();
    ui.clearLog();
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim().startsWith('{')) {
        ui.textarea.value = text.trim();
        ui.log('JSON carregado do clipboard.');
      }
    } catch {
      ui.log('Sem permissão de clipboard. Cole manualmente o JSON.');
    }
    ui.onFill(() => {
      try {
        const data = JSON.parse(ui.textarea.value || '{}');
        runAutofill(data, false);
      } catch {
        ui.log('JSON inválido.');
      }
    });
    ui.onPreview(() => {
      try {
        const data = JSON.parse(ui.textarea.value || '{}');
        runAutofill(data, true);
      } catch {
        ui.log('JSON inválido.');
      }
    });
  }

  // ================= Hotkeys =================
  window.addEventListener('keydown', (e)=>{
    if (e.ctrlKey && e.altKey && e.key.toLowerCase()==='s' && !e.shiftKey) {
      e.preventDefault(); openAndPaste(false);
    }
    if (e.ctrlKey && e.altKey && e.shiftKey && e.key.toLowerCase()==='s') {
      e.preventDefault(); openAndPaste(true);
    }
    if (e.ctrlKey && e.altKey && e.key.toLowerCase()==='l') {
      e.preventDefault();
      ui.el.style.display = (ui.el.style.display==='none'?'block':'none');
    }
  }, true);

})();
