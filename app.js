(function(){
  "use strict";

  var el = function(id){ return document.getElementById(id); };
  var screens = { start: el('screen-start'), play: el('screen-play'), done: el('screen-done') };

  /* верхняя граница счёта: задаётся страницей через <body data-limit="..."> */
  var LIMIT = +(document.body.dataset.limit || 10);

  var state = { tasks: [], i: 0, right: 0, wrong: 0, locked: false, timer: null, sound: true };

  /* ---------- клавиатура ответов ---------- */
  var pad = el('pad');
  for (var n = 0; n <= LIMIT; n++){
    var b = document.createElement('button');
    b.className = 'key';
    b.type = 'button';
    b.dataset.v = n;
    b.setAttribute('aria-label', 'Ответ ' + n);
    var dots = '';
    for (var p = 0; p < (n === 0 ? 1 : n); p++){
      dots += p < 10 ? '<i></i>' : (p < 20 ? '<i class="ten"></i>' : '<i class="twenty"></i>');
    }
    b.innerHTML = '<span class="key-num">' + n + '</span>' +
                  '<span class="pips' + (n === 0 ? ' zero' : '') + '">' + dots + '</span>';
    // колонка по единицам: 1, 11, 21 друг под другом, 10, 20, 30 в последней.
    // Учитывается только в широкой раскладке (11 колонок), см. style.css
    b.style.setProperty('--c', n === 0 ? 1 : ((n - 1) % 10) + 2);
    pad.appendChild(b);
  }
  var keys = Array.prototype.slice.call(pad.children);

  el('hint').textContent = 'Выбери ответ на клавиатуре внизу. Все ответы — от 0 до ' + LIMIT + '.';

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

    var slot = el('slot');
    slot.textContent = '?';
    slot.className = 'slot';

    el('verdict').textContent = '';
    el('verdict').className = 'verdict';

    el('c-now').textContent = state.i + 1;
    el('c-right').textContent = state.right;
    el('c-wrong').textContent = state.wrong;

    keys.forEach(function(k){
      k.disabled = false;
      k.classList.remove('pick-right', 'pick-wrong', 'reveal');
    });

    var marks = el('ribbon').children;
    for (var k = 0; k < marks.length; k++) marks[k].classList.toggle('now', k === state.i);
    state.locked = false;
  }

  function answer(value){
    if (state.locked) return;
    var t = state.tasks[state.i];
    var ok = value === t.ans;
    state.locked = true;

    keys.forEach(function(k){ k.disabled = true; });
    keys[value].classList.add(ok ? 'pick-right' : 'pick-wrong');

    var slot = el('slot');
    slot.textContent = value;
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
      keys[t.ans].classList.add('reveal');
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
    if (k && !k.disabled) answer(+k.dataset.v);
  });

  // цифры с клавиатуры; первая цифра двузначного ответа ждёт вторую 500 мс
  var buf = null, bufTimer = null;
  function dropBuf(){ clearTimeout(bufTimer); buf = null; }

  document.addEventListener('keydown', function(e){
    if (!screens.play.classList.contains('is-on')) return;
    if (e.key === 'Escape'){ clearTimeout(state.timer); dropBuf(); show('start'); return; }
    if (!/^[0-9]$/.test(e.key)) return;
    var d = +e.key;

    if (buf !== null){
      var two = buf * 10 + d;
      dropBuf();
      if (two <= LIMIT){ answer(two); return; }
    }

    if (d > 0 && d * 10 <= LIMIT){   // может быть началом двузначного ответа
      buf = d;
      bufTimer = setTimeout(function(){
        if (buf === d){ buf = null; answer(d); }
      }, 500);
      return;
    }

    answer(d);
  });
})();
