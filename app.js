(function(){
  "use strict";

  var el = function(id){ return document.getElementById(id); };
  var screens = { start: el('screen-start'), play: el('screen-play'), done: el('screen-done') };

  /* верхняя граница счёта: задаётся страницей через <body data-limit="..."> */
  var LIMIT = +(document.body.dataset.limit || 10);

  var state = { tasks: [], i: 0, right: 0, wrong: 0, locked: false, timer: null, sound: true, entry: '' };

  /* ---------- цифровая клавиатура ----------
     Ровно как на телефоне: 1–9, ряд ⌫ 0 ✓. Ответ ребёнок набирает сам,
     а не выбирает из готового ряда чисел — иначе клавиатура работает
     как линейка, по которой ответ можно просто отсчитать. */
  var pad = el('pad');
  var MAXLEN = String(LIMIT).length;   // 10, 20, 30 → двузначные ответы
  var digitKeys = [], okKey = null, delKey = null;

  [1,2,3,4,5,6,7,8,9,'del',0,'ok'].forEach(function(v){
    var b = document.createElement('button');
    b.type = 'button';
    if (v === 'del'){
      b.className = 'key key-fn key-del';
      b.dataset.act = 'del';
      b.setAttribute('aria-label', 'Стереть');
      b.innerHTML = '<span class="key-glyph">⌫</span>';
      delKey = b;
    } else if (v === 'ok'){
      b.className = 'key key-fn key-ok';
      b.dataset.act = 'ok';
      b.setAttribute('aria-label', 'Проверить ответ');
      b.innerHTML = '<span class="key-glyph">✓</span>';
      okKey = b;
    } else {
      b.className = 'key';
      b.dataset.d = v;
      b.setAttribute('aria-label', 'Цифра ' + v);
      b.innerHTML = '<span class="key-num">' + v + '</span>';
      digitKeys[v] = b;
    }
    pad.appendChild(b);
  });

  el('hint').textContent = 'Набери ответ цифрами и нажми ✓';

  /* ---------- ввод ответа ---------- */
  function syncPad(){
    var empty = state.entry === '';
    var full  = state.entry.length >= MAXLEN;
    for (var d = 0; d <= 9; d++) digitKeys[d].disabled = state.locked || full;
    delKey.disabled = state.locked || empty;
    okKey.disabled  = state.locked || empty;
  }

  function setEntry(v){
    state.entry = v;
    var slot = el('slot');
    slot.textContent = v === '' ? '?' : v;
    slot.classList.toggle('typing', v !== '');
    syncPad();
  }

  function pressDigit(d){
    if (state.locked) return;
    var e = state.entry === '0' ? '' : state.entry;   // без ведущего нуля
    if (e.length >= MAXLEN) return;
    setEntry(e + d);
    beep([520], 'sine', 0.04);
  }

  function backspace(){
    if (state.locked || state.entry === '') return;
    setEntry(state.entry.slice(0, -1));
  }

  function submit(){
    if (state.locked || state.entry === '') return;
    answer(+state.entry);
  }

  function flash(node){
    if (!node || node.disabled) return;
    node.classList.add('is-hit');
    setTimeout(function(){ node.classList.remove('is-hit'); }, 120);
  }

  /* ---------- звук ---------- */
  var ctx = null;
  function beep(freqs, type, dur){
    if (!state.sound) return;
    try{
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      freqs.forEach(function(f, k){
        var o = ctx.createOscillator(), g = ctx.createGain();
        var t0 = ctx.currentTime + k * dur;
        o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(t0); o.stop(t0 + dur + 0.02);
      });
    }catch(e){}
  }

  /* ---------- генерация примеров ---------- */
  function rnd(min, max){ return min + Math.floor(Math.random() * (max - min + 1)); }

  function makeTask(prev){
    for(;;){
      var plus = Math.random() < 0.5, a, b;
      if (plus){ a = rnd(0, LIMIT); b = rnd(0, LIMIT - a); }
      else     { a = rnd(1, LIMIT); b = rnd(0, a); }
      if (a === 0 && b === 0) continue;
      if (b === 0 && Math.random() < 0.75) continue;
      if (prev && prev.a === a && prev.b === b && prev.plus === plus) continue;
      return { a: a, b: b, plus: plus, ans: plus ? a + b : a - b };
    }
  }

  function buildTasks(count){
    var list = [], prev = null;
    for (var k = 0; k < count; k++){ prev = makeTask(prev); list.push(prev); }
    return list;
  }

  /* ---------- экраны ---------- */
  function show(name){
    for (var k in screens) screens[k].classList.toggle('is-on', k === name);
  }

  function drawRibbon(node){
    node.innerHTML = '';
    var frag = document.createDocumentFragment();
    for (var k = 0; k < state.tasks.length; k++) frag.appendChild(document.createElement('i'));
    node.appendChild(frag);
  }

  function startSession(count){
    clearTimeout(state.timer);
    state.tasks = buildTasks(count);
    state.i = 0; state.right = 0; state.wrong = 0; state.locked = false;
    el('c-total').textContent = count;
    drawRibbon(el('ribbon'));
    show('play');
    render();
  }

  function render(){
    var t = state.tasks[state.i];
    el('a').textContent = t.a;
    el('b').textContent = t.b;
    el('op').textContent = t.plus ? '+' : '−';

    el('slot').className = 'slot';

    el('verdict').textContent = '';
    el('verdict').className = 'verdict';

    el('c-now').textContent = state.i + 1;
    el('c-right').textContent = state.right;
    el('c-wrong').textContent = state.wrong;

    var marks = el('ribbon').children;
    for (var k = 0; k < marks.length; k++) marks[k].classList.toggle('now', k === state.i);
    state.locked = false;
    setEntry('');
  }

  function answer(value){
    if (state.locked) return;
    var t = state.tasks[state.i];
    var ok = value === t.ans;
    state.locked = true;
    syncPad();

    var slot = el('slot');
    slot.classList.remove('typing');
    slot.classList.add('filled', ok ? 'right' : 'wrong');

    var v = el('verdict');
    var mark = el('ribbon').children[state.i];
    mark.classList.remove('now');

    if (ok){
      state.right++;
      v.textContent = 'Верно!';
      v.className = 'verdict right';
      mark.classList.add('ok');
      beep([660, 990], 'sine', 0.09);
    } else {
      state.wrong++;
      v.textContent = 'Правильный ответ: ' + t.ans;
      v.className = 'verdict wrong';
      mark.classList.add('bad');
      beep([180], 'square', 0.22);
    }

    el('c-right').textContent = state.right;
    el('c-wrong').textContent = state.wrong;

    state.timer = setTimeout(next, ok ? 700 : 1700);
  }

  function next(){
    state.i++;
    if (state.i >= state.tasks.length) finish();
    else render();
  }

  function finish(){
    var total = state.tasks.length;
    el('d-pct').textContent = Math.round(state.right / total * 100);
    el('d-line').textContent = 'Верно ' + state.right + ' из ' + total;
    el('d-sub').textContent = 'С ошибкой: ' + state.wrong;

    var dr = el('d-ribbon');
    dr.innerHTML = el('ribbon').innerHTML;
    var marks = dr.children;
    for (var k = 0; k < marks.length; k++) marks[k].classList.remove('now');

    show('done');
  }

  /* ---------- события ---------- */
  var slider = el('count'), out = el('count-out');
  slider.addEventListener('input', function(){ out.textContent = slider.value; });

  el('btn-start').addEventListener('click', function(){ startSession(+slider.value); });
  el('btn-again').addEventListener('click', function(){ startSession(state.tasks.length); });
  el('btn-home').addEventListener('click', function(){ show('start'); });
  el('btn-restart').addEventListener('click', function(){ startSession(state.tasks.length); });
  el('btn-exit').addEventListener('click', function(){
    clearTimeout(state.timer);
    show('start');
  });

  el('btn-sound').addEventListener('click', function(){
    state.sound = !state.sound;
    this.textContent = state.sound ? '🔊' : '🔇';
    this.setAttribute('aria-pressed', String(state.sound));
    this.title = state.sound ? 'Звук включён' : 'Звук выключен';
  });

  pad.addEventListener('click', function(e){
    var k = e.target.closest('.key');
    if (!k || k.disabled) return;
    if (k.dataset.act === 'ok') submit();
    else if (k.dataset.act === 'del') backspace();
    else pressDigit(k.dataset.d);
  });

  document.addEventListener('keydown', function(e){
    if (!screens.play.classList.contains('is-on')) return;

    if (e.key === 'Escape'){ clearTimeout(state.timer); show('start'); return; }

    // flash до действия: клавиша могла стать неактивной именно из-за него
    if (/^[0-9]$/.test(e.key)){ flash(digitKeys[+e.key]); pressDigit(e.key); return; }

    if (e.key === 'Backspace'){ e.preventDefault(); flash(delKey); backspace(); return; }

    if (e.key === 'Enter' || e.key === ' '){
      // не перехватываем Enter/пробел, если фокус на другой кнопке экрана
      if (e.target.tagName === 'BUTTON' && !pad.contains(e.target)) return;
      e.preventDefault();
      flash(okKey); submit();
    }
  });
})();
