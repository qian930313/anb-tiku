/* 安管人员B类 · 能力考核刷题 */
(function () {
  'use strict';

  var DATA = window.QUESTION_DATA;
  var QS = DATA.questions;
  var QMAP = {};
  QS.forEach(function (q) { QMAP[q.id] = q; });
  // 案例材料表：q.m → 材料文本
  var CMAP = {};
  (DATA.cases || []).forEach(function (c) { CMAP[c.id] = c.material; });

  var KEY = 'anb_exam_v1';
  var TOKEN_KEY = 'anb_gh_token';
  var SYNC = { owner: 'qian930313', repo: 'anb-tiku', branch: 'sync-data', path: 'sync.json' };
  // URL 带 ?token=ghp_xxx → 保存后立刻从地址栏抹掉（手机扫码配对用）
  (function () {
    try {
      var m = location.search.match(/[?&]token=(ghp_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+)/);
      if (m) {
        localStorage.setItem(TOKEN_KEY, m[1]);
        if (history.replaceState) history.replaceState(null, '', location.pathname);
      }
    } catch (e) {}
  })();
  var store = loadStore();
  var ses = null;      // 练习会话
  var exam = null;     // 考试会话
  var timerId = null;

  /* ---------------- 存储 ---------------- */
  function loadStore() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.rec) {
        if (!s.notes) s.notes = {};
        // 旧格式 {id: "文本"} 升级为 {id: {t, ts}}
        Object.keys(s.notes).forEach(function (k) {
          if (typeof s.notes[k] === 'string') s.notes[k] = { t: s.notes[k], ts: 0 };
        });
        return s;
      }
    } catch (e) {}
    return { rec: {}, fav: {}, wrong: {}, notes: {}, exams: [], last: null };
  }
  function saveStore() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
  }
  function rec(id) {
    return store.rec[id] || (store.rec[id] = { c: 0, w: 0, s: 0, ts: 0 });
  }

  /* ---------------- 批注 ---------------- */
  function getNote(id) {
    var n = store.notes[id];
    return n && n.t ? n : null;
  }
  function noteCount() {
    return Object.keys(store.notes).filter(function (k) {
      return store.notes[k] && store.notes[k].t;
    }).length;
  }
  function saveNote(id, text) {
    text = String(text || '').replace(/\s+$/, '');
    if (!text) { delete store.notes[id]; }
    else store.notes[id] = { t: text, ts: Date.now() };
    saveStore();
  }

  /* ---------------- 工具 ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function letter(i) { return String.fromCharCode(65 + i); }
  function sortLetters(s) { return s.split('').sort().join(''); }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function typeName(t) {
    return t === 'judge' ? '判断题' : t === 'multi' ? '多选题' : '单选题';
  }
  var SUBJ = { c_js: '安全生产技术', c_fg: '法律法规', c_gl: '安全生产管理' };
  // 题库名称与原始文件夹一一对应
  var BANK_FULL = {
    all: '全部题库',
    c: '三类题库（理论考核）',
    a: '安管人员B类能力考核题',
    b: '能力考核题库（B类人员）',
    cs: '案例题（材料分析）'
  };
  // 题目卡片/列表里用的短名，避免标签过长
  var BANK_SHORT = { a: '安管B类考核', b: 'B类人员考核', c: '三类题库', cs: '案例题' };
  function bankName(b) {
    return BANK_FULL[b] || BANK_FULL.all;
  }
  function sourceName(q) {
    if (q.b === 'cs') return SUBJ[q.g] + ' · 案例第' + q.n + '案·第' + (q.sn || 1) + '问';
    if (q.b === 'a' || q.b === 'b') return BANK_SHORT[q.b];
    return SUBJ[q.g] || BANK_SHORT.c;
  }
  function matchBank(q, bank) {
    if (!bank) return true;
    if (bank === 'all') return q.b !== 'cs';   // 全部题库不含案例小问
    if (bank === 'cs') return q.b === 'cs';
    if (bank === 'a' || bank === 'b' || bank === 'c') return q.b === bank;
    return q.g === bank;
  }
  function toast(msg) {
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;left:50%;bottom:88px;transform:translateX(-50%);' +
      'background:rgba(16,24,40,.9);color:#fff;font-size:13px;padding:9px 16px;border-radius:10px;' +
      'z-index:99;max-width:80%;text-align:center;line-height:1.5;transition:opacity .3s';
    document.body.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; }, 1500);
    setTimeout(function () { el.remove(); }, 1900);
  }
  function show(view) {
    ['home', 'quiz', 'exam', 'result', 'list'].forEach(function (v) {
      $('view-' + v).hidden = (v !== view);
    });
    window.scrollTo(0, 0);
  }

  /* ---------------- 首页 ---------------- */
  function renderHome() {
    var done = 0, right = 0, wrong = 0;
    Object.keys(store.rec).forEach(function (id) {
      var r = store.rec[id];
      done += r.c + r.w;
      right += r.c;
      wrong += r.w;
    });
    var wrongCount = Object.keys(store.wrong).length;
    var favCount = Object.keys(store.fav).length;
    var acc = done ? Math.round(right / done * 100) : 0;

    $('stat-row').innerHTML =
      stat(done, '累计答题', '') +
      stat(acc + '%', '正确率', 'is-ok') +
      stat(wrongCount, '错题本', 'is-err') +
      stat(favCount, '收藏', '');

    $('wrong-sub').textContent = wrongCount + ' 题';
    $('fav-sub').textContent = favCount + ' 题';
    var nCount = noteCount();
    $('note-sub').textContent = nCount ? nCount + ' 条批注 · 记下错因好复习' : '还没有批注';

    var lastValid = validLast(store.last);
    if (lastValid) {
      var l = lastValid;
      var pct = Math.min(100, Math.round((l.idx) / l.list.length * 100));
      $('continue-sub').textContent = l.title + ' · ' + Math.min(l.idx + 1, l.list.length) + '/' + l.list.length;
    } else {
      $('continue-sub').textContent = '暂无记录';
    }
  }
  function stat(v, label, cls) {
    return '<div class="stat ' + cls + '"><b>' + v + '</b><small>' + label + '</small></div>';
  }

  /* ---------------- 组题 ---------------- */
  function pick(bank, type, mode, limit) {
    var arr = QS.filter(function (q) {
      if (!matchBank(q, bank)) return false;
      if (type !== 'all' && q.t !== type) return false;
      return true;
    });
    if (mode === 'wrong') arr = arr.filter(function (q) { return store.wrong[q.id]; });
    if (mode === 'fav') arr = arr.filter(function (q) { return store.fav[q.id]; });
    if (mode === 'random') arr = shuffle(arr);
    if (mode === 'wrong') {
      arr.sort(function (a, b) { return (store.wrong[a.id] || 0) - (store.wrong[b.id] || 0); });
    }
    if (limit && arr.length > limit) arr = arr.slice(0, limit);
    return arr.map(function (q) { return q.id; });
  }

  /* ---------------- 练习 ---------------- */
  function startPractice(cfg) {
    var list = cfg.listOverride ? cfg.listOverride.slice()
             : pick(cfg.bank || 'all', cfg.type || 'all', cfg.mode || 'seq', cfg.limit || 0);
    if (!list.length) {
      toast(cfg.mode === 'wrong' ? '错题本是空的，先去练习吧' :
            cfg.mode === 'fav' ? '还没有收藏题目' : '没有符合条件的题目');
      return;
    }
    ses = {
      list: list, idx: cfg.start || 0, ans: cfg.restore ? (cfg.restore.ans || {}) : {},
      mode: cfg.mode || 'seq', bank: cfg.bank || 'all', type: cfg.type || 'all',
      title: cfg.title || buildTitle(cfg), multiSel: null
    };
    $('finish-panel').hidden = true;
    show('quiz');
    renderQuiz();
    saveLast();
  }
  function buildTitle(cfg) {
    if (cfg.mode === 'wrong') return '错题重做';
    if (cfg.mode === 'fav') return '我的收藏';
    if (cfg.mode === 'random') return '随机抽题';
    if (cfg.type !== 'all' && cfg.type) return typeName(cfg.type) + '专项';
    // 顶栏空间有限，用短名；完整文件夹名在首页题库卡上
    return SUBJ[cfg.bank] || BANK_SHORT[cfg.bank] || bankName(cfg.bank);
  }
  // 只有「顺序练习」（题库/专项）才记作继续练习的断点；
  // 随机抽题、错题重做、收藏重做都是一次性的，不能把断点顶掉
  function validLast(l) {
    return (l && l.list && l.list.length && l.mode === 'seq') ? l : null;
  }
  function saveLast() {
    if (!ses) return;
    if (ses.mode !== 'seq') return;
    store.last = {
      list: ses.list, idx: ses.idx, ans: ses.ans, mode: ses.mode,
      bank: ses.bank, type: ses.type, title: ses.title
    };
    saveStore();
  }

  function curQ() { return QMAP[ses.list[ses.idx]]; }

  function renderQuiz() {
    var q = curQ();
    if (!q) return finishPractice();
    var total = ses.list.length;
    $('quiz-title').textContent = ses.title;
    $('quiz-counter').textContent = (ses.idx + 1) + '/' + total;
    $('quiz-progress').style.width = Math.round((ses.idx + 1) / total * 100) + '%';

    $('q-type').textContent = typeName(q.t) + (q.t === 'multi' ? ' · 可多选' : '');
    $('q-source').textContent = sourceName(q);
    $('q-stem').textContent = q.q;

    // 案例材料
    var mBox = $('q-material');
    if (q.m && CMAP[q.m]) {
      mBox.hidden = false;
      mBox.textContent = CMAP[q.m];
    } else {
      mBox.hidden = true;
      mBox.textContent = '';
    }

    var fig = $('q-figure'), im = $('q-img');
    if (q.i) {
      fig.classList.remove('hide');
      im.src = q.i;
      im.onclick = function () { openLightbox(q.i); };
    } else {
      fig.classList.add('hide');
      im.removeAttribute('src');
    }

    var answered = ses.ans[q.id] !== undefined;
    var sel = ses.ans[q.id];
    var box = $('q-options');
    box.innerHTML = '';
    q.o.forEach(function (text, i) {
      var b = document.createElement('button');
      b.className = 'opt';
      b.type = 'button';
      b.innerHTML = '<span class="k">' + letter(i) + '</span><span class="t">' + esc(text) + '</span>';
      if (answered) {
        b.disabled = true;
        var L = letter(i);
        var isRight = q.a.indexOf(L) >= 0;
        var isSel = sel && sel.indexOf(L) >= 0;
        if (isRight) b.classList.add('ok');
        else if (isSel) b.classList.add('err');
        else b.classList.add('dim');
      } else {
        if (q.t === 'multi') {
          b.onclick = function () { toggleMulti(b, i, q); };
        } else {
          b.onclick = function () { answerSingle(i, q); };
        }
      }
      box.appendChild(b);
    });

    // 底部按钮
    var isMulti = q.t === 'multi';
    var btnSub = $('btn-submit');
    if (!answered && isMulti) {
      btnSub.hidden = false;
      btnSub.disabled = !(ses.multiSel && ses.multiSel.length);
    } else {
      btnSub.hidden = true;
    }
    $('nav-next').textContent = ses.idx === total - 1 ? '完成' : '下一题';
    $('nav-next').classList.toggle('nav-go', answered);

    // 判定区
    var v = $('q-verdict');
    if (answered) {
      var ok = sortLetters(sel) === sortLetters(q.a);
      v.hidden = false;
      v.className = 'verdict ' + (ok ? 'good' : 'bad');
      v.innerHTML = ok
        ? '<b>回答正确</b>　正确答案：<span class="ans">' + q.a + '</span>'
        : '<b>回答错误</b>　你选了 ' + sel + '，正确答案：<span class="ans">' + q.a + '</span>';
    } else {
      v.hidden = true;
      v.innerHTML = '';
    }

    // 批注
    var okNow = answered && sortLetters(sel) === sortLetters(q.a);
    renderNoteSlot('q-note', q.id, false, answered && !okNow);
    $('btn-note-q').textContent = getNote(q.id) ? '✎ 已批注' : '✎ 批注';

    // 收藏态
    var favBtn = $('btn-fav-q');
    var isFav = !!store.fav[q.id];
    favBtn.textContent = isFav ? '★ 已收藏' : '☆ 收藏';

    $('nav-prev').disabled = ses.idx === 0;
    $('nav-next').disabled = ses.idx >= total - 1;
    preload(ses.list[ses.idx + 1]);
  }

  function toggleMulti(btn, i, q) {
    ses.multiSel = ses.multiSel || [];
    var L = letter(i);
    var at = ses.multiSel.indexOf(L);
    if (at >= 0) {
      ses.multiSel.splice(at, 1);
      btn.classList.remove('sel');
    } else {
      ses.multiSel.push(L);
      btn.classList.add('sel');
    }
    $('btn-submit').disabled = ses.multiSel.length === 0;
  }

  function answerSingle(i, q) {
    var L = letter(i);
    ses.ans[q.id] = L;
    judge(q, L);
  }

  function submitMulti(q) {
    if (!ses.multiSel || !ses.multiSel.length) return;
    var L = sortLetters(ses.multiSel.join(''));
    ses.ans[q.id] = L;
    judge(q, L);
  }

  function judge(q, picked) {
    var ok = sortLetters(picked) === sortLetters(q.a);
    var r = rec(q.id);
    r.ts = Date.now();
    if (ok) {
      r.c++; r.s++;
      if (store.wrong[q.id] && r.s >= 2) {
        delete store.wrong[q.id];
        toast('连续答对 2 次，已移出错题本');
      }
    } else {
      r.w++; r.s = 0;
      store.wrong[q.id] = Date.now();
    }
    ses.multiSel = null;
    saveStore();
    saveLast();
    renderQuiz();
    // 自动平滑滚动到判定区
    var v = $('q-verdict');
    if (v && !v.hidden) {
      var rect = v.getBoundingClientRect();
      if (rect.bottom > window.innerHeight - 60) v.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function nextQuiz() {
    if (ses.idx >= ses.list.length - 1) return finishPractice();
    ses.idx++;
    ses.multiSel = null;
    saveLast();
    renderQuiz();
    window.scrollTo(0, 0);
  }
  function prevQuiz() {
    if (ses.idx === 0) return;
    ses.idx--;
    ses.multiSel = null;
    saveLast();
    renderQuiz();
    window.scrollTo(0, 0);
  }

  function finishPractice() {
    var right = 0, wrong = 0, blank = 0;
    ses.list.forEach(function (id) {
      var a = ses.ans[id];
      if (a === undefined) { blank++; return; }
      if (sortLetters(a) === sortLetters(QMAP[id].a)) right++; else wrong++;
    });
    var total = ses.list.length;
    var done = right + wrong;
    var acc = done ? Math.round(right / done * 100) : 0;

    $('fin-title').textContent = ses.title + ' · 本组完成';
    $('fin-acc').textContent = acc + '%';
    $('fin-detail').innerHTML =
      '答对 ' + right + ' 题　答错 ' + wrong + ' 题' + (blank ? '　未答 ' + blank + ' 题' : '') +
      '<br>共 ' + total + ' 题';
    $('finish-panel').hidden = false;
    $('quiz-progress').style.width = '100%';
    $('quiz-counter').textContent = total + '/' + total;

    var cfg = { bank: ses.bank, type: ses.type, mode: ses.mode, title: ses.title };
    $('fin-again').onclick = function () { startPractice(cfg); };
    store.last = null;
    saveStore();
  }

  function goHome() {
    ses = null;
    $('finish-panel').hidden = true;
    $('drawer-mask').hidden = true;
    $('lightbox').hidden = true;
    renderHome();
    show('home');
  }

  /* ---------------- 考试 ---------------- */
  var PRESET = {
    quick: { judge: 10, single: 15, multi: 5, min: 25, name: '快速模考' },
    full: { judge: 30, single: 50, multi: 20, min: 60, name: '标准模考' }
  };
  // 理论库没有多选题，按比例补到判断/单选
  var THEORY_Q = {
    quick: { judge: 12, single: 18, multi: 0, min: 25, name: '理论快速模考' },
    full: { judge: 40, single: 60, multi: 0, min: 60, name: '理论标准模考' }
  };
  var examScope = 'ab';

  function scopePool() {
    if (examScope === 'ab') return QS.filter(function (q) { return q.b === 'a' || q.b === 'b'; });
    if (examScope === 'c') return QS.filter(function (q) { return q.b === 'c'; });
    return QS.filter(function (q) { return q.b !== 'cs'; });   // 考试不含案例小问
  }

  function startExam(kind) {
    var p = (examScope === 'c' ? THEORY_Q : PRESET)[kind];
    var pool0 = scopePool();
    var list = [];
    ['judge', 'single', 'multi'].forEach(function (t) {
      var pool = shuffle(pool0.filter(function (q) { return q.t === t; }));
      list = list.concat(pool.slice(0, p[t]).map(function (q) { return q.id; }));
    });
    if (list.length < 5) { toast('题库不足'); return; }
    exam = {
      kind: kind, name: p.name, list: shuffle(list), idx: 0, ans: {},
      endAt: Date.now() + p.min * 60000, min: p.min, submitted: false
    };
    show('exam');
    renderExam();
    startTimer();
  }

  function startTimer() {
    stopTimer();
    timerId = setInterval(function () {
      if (!exam || exam.submitted) return;
      var left = exam.endAt - Date.now();
      if (left <= 0) { submitExam(true); return; }
      var m = Math.floor(left / 60000), s = Math.floor(left % 60000 / 1000);
      var el = $('exam-timer');
      el.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      el.classList.toggle('low', left < 5 * 60000);
    }, 250);
  }
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

  function renderExam() {
    var q = QMAP[exam.list[exam.idx]];
    var total = exam.list.length;
    $('exam-title').textContent = exam.name;
    $('exam-progress').style.width = Math.round((exam.idx + 1) / total * 100) + '%';
    $('e-type').textContent = typeName(q.t) + (q.t === 'multi' ? ' · 可多选' : '');
    $('e-no').textContent = '第 ' + (exam.idx + 1) + ' / ' + total + ' 题';
    $('e-stem').textContent = q.q;

    var fig = $('e-figure'), im = $('e-img');
    if (q.i) {
      fig.classList.remove('hide');
      im.src = q.i;
      im.onclick = function () { openLightbox(q.i); };
    } else {
      fig.classList.add('hide');
      im.removeAttribute('src');
    }

    var sel = exam.ans[q.id];
    var box = $('e-options');
    box.innerHTML = '';
    q.o.forEach(function (text, i) {
      var b = document.createElement('button');
      b.className = 'opt';
      b.type = 'button';
      b.innerHTML = '<span class="k">' + letter(i) + '</span><span class="t">' + esc(text) + '</span>';
      var L = letter(i);
      if (sel && sel.indexOf(L) >= 0) b.classList.add('sel');
      b.onclick = function () {
        if (q.t === 'multi') {
          var cur = exam.ans[q.id] ? exam.ans[q.id].split('') : [];
          var at = cur.indexOf(L);
          if (at >= 0) cur.splice(at, 1); else cur.push(L);
          if (cur.length) exam.ans[q.id] = sortLetters(cur.join(''));
          else delete exam.ans[q.id];
          renderExam();
        } else {
          exam.ans[q.id] = L;
          renderExam();
          if (exam.idx < total - 1) {
            setTimeout(function () { exam.idx++; renderExam(); }, 160);
          }
        }
      };
      box.appendChild(b);
    });

    // 批注（考试中不显示答案）
    renderNoteSlot('e-note', q.id, true, false);

    $('e-prev').disabled = exam.idx === 0;
    $('e-next').textContent = exam.idx === total - 1 ? '交卷' : '下一题';
    preload(exam.list[exam.idx + 1]);
  }

  function examNav(d) {
    var n = exam.idx + d;
    if (n < 0) return;
    if (n >= exam.list.length) { openSheet(); return; }
    exam.idx = n;
    renderExam();
    window.scrollTo(0, 0);
  }

  function openSheet() {
    var g = $('sheet-grid');
    g.innerHTML = '';
    exam.list.forEach(function (id, i) {
      var c = document.createElement('button');
      c.className = 'sheet-cell';
      c.textContent = i + 1;
      if (getNote(id)) c.classList.add('has-note');
      if (exam.ans[id]) c.classList.add('done');
      if (i === exam.idx) c.classList.add('cur');
      c.onclick = function () {
        exam.idx = i; closeSheet(); renderExam(); window.scrollTo(0, 0);
      };
      g.appendChild(c);
    });
    var answeredN = exam.list.filter(function (id) { return exam.ans[id]; }).length;
    $('sheet-count').textContent = '已答 ' + answeredN + ' / ' + exam.list.length;
    $('drawer-mask').hidden = false;
  }
  function closeSheet() { $('drawer-mask').hidden = true; }

  function submitExam(auto) {
    if (!exam || exam.submitted) return;
    var blank = exam.list.filter(function (id) { return !exam.ans[id]; }).length;
    if (!auto && blank > 0) {
      if (!confirm('还有 ' + blank + ' 题未作答，确定交卷吗？')) return;
    }
    exam.submitted = true;
    stopTimer();
    closeSheet();

    var right = 0, wrong = 0;
    exam.list.forEach(function (id) {
      var q = QMAP[id], a = exam.ans[id];
      var r = rec(id);
      r.ts = Date.now();
      if (a && sortLetters(a) === sortLetters(q.a)) {
        right++; r.c++; r.s++;
      } else {
        wrong++; r.w++; r.s = 0;
        store.wrong[id] = Date.now();
      }
    });
    var total = exam.list.length;
    var score = Math.round(right / total * 100);
    store.exams.push({ ts: Date.now(), name: exam.name, score: score, right: right, total: total, min: exam.min });
    if (store.exams.length > 30) store.exams = store.exams.slice(-30);
    saveStore();

    $('result-sub').textContent = exam.name + ' · ' + new Date().toLocaleString('zh-CN', { hour12: false });
    $('score-num').textContent = score;
    var pass = score >= 60;
    $('score-verdict').textContent = pass ? '合格' : '不合格';
    $('score-verdict').className = 'verdict-line ' + (pass ? 'ok' : 'bad');
    $('score-detail').innerHTML =
      '答对 ' + right + ' 题 · 答错 ' + (total - right - blank) + ' 题 · 未答 ' + blank + ' 题<br>' +
      '共 ' + total + ' 题 · 限时 ' + exam.min + ' 分钟 · 及格线 60 分';
    $('score-ring').style.background =
      'conic-gradient(' + (pass ? '#12805c' : '#d92d20') + ' ' + (score * 3.6) + 'deg, #eef1f6 0deg)';

    var wrongIds = exam.list.filter(function (id) {
      var a = exam.ans[id];
      return !a || sortLetters(a) !== sortLetters(QMAP[id].a);
    });
    $('btn-review').onclick = function () {
      if (!wrongIds.length) { toast('全部答对，太棒了'); return; }
      startPractice({
        mode: 'review', title: '本次错题精练', listOverride: wrongIds
      });
    };
    $('btn-again').onclick = function () { startExam(exam.kind); };
    $('btn-home').onclick = goHome;
    show('result');
  }

  /* ---------------- 错题 / 收藏 / 批注列表 ---------------- */
  function noteIds() {
    return Object.keys(store.notes).filter(function (k) {
      return store.notes[k] && store.notes[k].t && QMAP[k];
    }).sort(function (a, b) {
      return (store.notes[b].ts || 0) - (store.notes[a].ts || 0);
    });
  }

  function openList(kind) {
    var ids;
    var title, emptyMsg, noteMode = kind === 'note';
    if (noteMode) {
      ids = noteIds();
      title = '我的批注';
      emptyMsg = '还没有批注。做题时点下方的「✎ 批注」，就能把错因、口诀记下来。';
    } else {
      ids = kind === 'wrong' ? Object.keys(store.wrong) : Object.keys(store.fav);
      ids.sort(function (a, b) {
        return (kind === 'wrong' ? store.wrong[b] : store.fav[b]) -
               (kind === 'wrong' ? store.wrong[a] : store.fav[a]);
      });
      title = kind === 'wrong' ? '错题本' : '我的收藏';
      emptyMsg = kind === 'wrong' ? '还没有错题，继续保持' : '还没有收藏题目';
    }
    $('list-title').textContent = title;
    $('list-sub').textContent = ids.length + (noteMode ? ' 条' : ' 题');
    var body = $('list-body');
    if (!ids.length) {
      body.innerHTML = '<div class="empty">' + emptyMsg + '</div>';
    } else {
      body.innerHTML = ids.map(function (id) {
        var q = QMAP[id];
        if (!q) return '';
        var r = store.rec[id] || { c: 0, w: 0 };
        var n = getNote(id);
        var extra = '';
        if (noteMode) {
          extra = '<div class="ln-note"><span class="ln-tag">✎</span>' +
            esc(n.t).replace(/\n/g, '<br>') + '</div>';
        } else if (n) {
          extra = '<div class="li-note"><span class="ln-tag">✎</span>' +
            esc(n.t).replace(/\n/g, '<br>') + '</div>';
        }
        return '<button class="list-item" data-id="' + id + '">' +
          '<div class="li-top"><span class="tag tag-type">' + typeName(q.t) + '</span>' +
          '<span class="tag">' + sourceName(q) + ' ' + q.n + '</span>' +
          (n ? '<span class="tag-note">已批注</span>' : '') + '</div>' +
          '<div class="li-stem">' + esc(q.q) + '</div>' +
          extra +
          '<div class="li-meta">正确答案 ' + q.a + ' · 答对 ' + r.c + ' 次 / 答错 ' + r.w + ' 次</div>' +
          '</button>';
      }).join('');
      Array.prototype.forEach.call(body.querySelectorAll('.list-item'), function (el) {
        el.onclick = function () {
          var id = el.getAttribute('data-id');
          startPractice({
            mode: kind, bank: 'all', type: 'all',
            title: noteMode ? '批注题目' : (kind === 'wrong' ? '错题重做' : '我的收藏'),
            listOverride: ids, start: Math.max(0, ids.indexOf(id))
          });
        };
      });
    }
    // 批注本：右上角加导出按钮
    var exportBtn = $('list-export');
    if (exportBtn) {
      exportBtn.hidden = !noteMode || !ids.length;
      exportBtn.onclick = function () { exportNotes('md'); };
    }
    show('list');
  }

  /* ---------------- 批注 ---------------- */
  var NOTE_TAGS = ['审题不清', '概念记混', '数字记错', '漏选', '口诀', '易错陷阱', '法条原文', '必须背'];
  var noteCtx = null;   // {id, fromExam, afterSave}

  function noteHTML(id, fromExam, wrongNow) {
    var n = getNote(id);
    if (!n) {
      var tip = fromExam ? '✎ 记点东西（交卷后在批注本查看）'
        : wrongNow ? '✎ 记下这次为什么选错'
        : '✎ 给这道题写批注 / 记忆口诀';
      return '<div class="note-empty">' +
        '<button class="note-add" type="button" data-note="' + id + '">' + tip + '</button></div>';
    }
    var d = n.ts ? new Date(n.ts) : null;
    var stamp = d ? (d.getMonth() + 1) + '月' + d.getDate() + '日' : '';
    return '<div class="note-card-in">' +
      '<div class="note-head-in"><span class="note-ico">✎</span><b>我的批注</b>' +
      (stamp ? '<span class="note-time">' + stamp + '</span>' : '') +
      '<button class="note-edit" type="button" data-note="' + id + '">编辑</button></div>' +
      '<div class="note-text">' + esc(n.t).replace(/\n/g, '<br>') + '</div></div>';
  }

  function openNote(id, fromExam) {
    var q = QMAP[id];
    if (!q) return;
    noteCtx = { id: id, fromExam: !!fromExam };
    $('note-title').textContent = fromExam ? '考试批注' : '本题批注';
    var stem = q.q;
    $('note-stem').textContent = stem.length > 70 ? stem.slice(0, 70) + '…' : stem;
    $('note-hint').textContent = fromExam
      ? '考试中不会显示答案，交卷后可在批注本查看'
      : '正确答案 ' + q.a + (q.t !== 'judge' ? '（' + q.a.split('').map(function (L) {
          return L + '.' + (q.o[L.charCodeAt(0) - 65] || '');
        }).join(' ') + '）' : '');
    var n = getNote(id);
    $('note-input').value = n ? n.t : '';
    $('note-del').hidden = !n;
    $('note-modal').hidden = false;
    setTimeout(function () {
      var ta = $('note-input');
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }, 30);
  }
  function closeNote() {
    $('note-modal').hidden = true;
    noteCtx = null;
  }
  function doSaveNote() {
    if (!noteCtx) return;
    var id = noteCtx.id;
    var before = getNote(id);
    saveNote(id, $('note-input').value);
    var after = getNote(id);
    closeNote();
    if (!after) toast('批注已删除');
    else toast(before ? '批注已更新' : '批注已保存');
    flushNoteRefresh();
  }
  var noteCtxRefresh = null;   // 由调用方设置的刷新回调
  function flushNoteRefresh() {
    var f = noteCtxRefresh;
    noteCtxRefresh = null;
    if (f) f();
  }
  function renderNoteSlot(slotId, id, fromExam, wrongNow) {
    var el = $(slotId);
    if (!el) return;
    el.innerHTML = noteHTML(id, fromExam, wrongNow);
    var btn = el.querySelector('[data-note]');
    if (btn) btn.onclick = function () {
      noteCtxRefresh = function () { renderNoteSlot(slotId, id, fromExam, wrongNow); };
      openNote(id, fromExam);
    };
  }

  function exportNotes(fmt) {
    var ids = Object.keys(store.notes).filter(function (k) {
      return store.notes[k] && store.notes[k].t;
    });
    ids.sort(function (a, b) { return (store.notes[b].ts || 0) - (store.notes[a].ts || 0); });
    var d = new Date();
    var stamp = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    var name = '安B批注_' + stamp;

    if (fmt === 'json') {
      var payload = {
        app: 'anb-exam', v: 1, exported: new Date().toISOString(),
        notes: {}, fav: store.fav, wrong: store.wrong, rec: store.rec, exams: store.exams
      };
      ids.forEach(function (id) { payload.notes[id] = store.notes[id]; });
      doExport(JSON.stringify(payload, null, 2), name + '.json');
      return;
    }

    var lines = ['# 我的批注（' + ids.length + ' 条）', ''];
    if (!ids.length) lines.push('（暂无批注）');
    ids.forEach(function (id, i) {
      var q = QMAP[id];
      if (!q) return;
      var n = store.notes[id];
      lines.push('## ' + (i + 1) + '. [' + typeName(q.t) + '] ' + sourceName(q) + ' 第' + q.n + '题');
      lines.push('');
      lines.push('**题目：** ' + q.q);
      if (q.t !== 'judge') {
        lines.push('');
        lines.push(q.o.map(function (o, j) { return letter(j) + '. ' + o; }).join('　'));
      }
      lines.push('');
      lines.push('**正确答案：** ' + q.a);
      if (q.i) lines.push('');
      if (q.i) lines.push('（配图：' + q.i.replace(/^img\//, '') + '）');
      lines.push('');
      lines.push('**我的批注：** ' + n.t.replace(/\n/g, '\n> '));
      lines.push('');
    });
    doExport(lines.join('\n'), name + '.md');
  }

  // 本地 file:// 下 Chrome 会拦截普通下载，优先用系统保存对话框
  var EXT_MAP = { md: '.md', json: '.json' };
  function saveAsFile(text, filename, mime) {
    var ext = filename.slice(filename.lastIndexOf('.'));
    if (!window.showSaveFilePicker) return Promise.reject(new Error('no-fsa'));
    return window.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: '批注导出', accept: { '*/*': [ext] } }]
    }).then(function (fh) {
      return fh.createWritable().then(function (w) {
        return w.write(text).then(function () { return w.close(); });
      });
    });
  }
  // 保存失败时的兜底：弹出面板，可复制 / 再次尝试下载
  function openExportBox(text, filename) {
    $('export-title').textContent = '导出：' + filename;
    $('export-tip').textContent =
      '浏览器可能会拦截本地文件的下载。被拦截时：① 点地址栏右侧的下载拦截图标 → 选择「保留」；' +
      '② 或直接点「复制全部」，粘贴到记事本 / Word 里保存。';
    $('export-text').value = text;
    $('export-modal').hidden = false;
    $('export-dl').onclick = function () {
      var a = document.createElement('a');
      a.href = 'data:' + (/\.json$/.test(filename) ? 'application/json' : 'text/markdown') +
               ';charset=utf-8,' + encodeURIComponent(text);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
  }
  function doExport(text, filename) {
    // md 加 BOM，Windows 记事本 / Word 打开才不会乱码（JSON 不加，否则无法解析）
    if (/\.md$/.test(filename)) text = '\ufeff' + text;
    saveAsFile(text, filename).then(function () {
      toast('已保存到你选择的位置');
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return;   // 用户自己取消了
      openExportBox(text, filename);
    });
  }
  function copyText(el) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(el.value).then(function () {
        toast('已复制到剪贴板');
      }, function () { legacyCopy(el); });
    } else legacyCopy(el);
  }
  function legacyCopy(el) {
    el.select();
    try { document.execCommand('copy'); toast('已复制到剪贴板'); }
    catch (e) { toast('复制失败，请手动全选复制'); }
  }

  // 两份学习记录取并集（规则：批注去重拼接 / 收藏并集 / 错题取大 / 练习逐项取大）
  // 练习断点：只有"同一次顺序练习"才比较进度，否则保留本机的，避免被别的设备拽走
  function mergeLast(la, lb) {
    var a = (la && la.list && la.list.length && la.mode === 'seq') ? la : null;
    var b = (lb && lb.list && lb.list.length && lb.mode === 'seq') ? lb : null;
    if (!a) return b;
    if (!b) return a;
    var same = a.mode === 'seq' && b.mode === 'seq' && a.bank === b.bank &&
               a.type === b.type && a.list.length === b.list.length;
    if (!same) return a;
    return (b.idx || 0) > (a.idx || 0) ? b : a;
  }

  function mergeStores(a, b) {
    var out = {
      rec: a.rec || {}, fav: a.fav || {}, wrong: a.wrong || {},
      exams: a.exams || {}, notes: a.notes || {},
      last: mergeLast(a.last, b.last)
    };
    Object.keys(b.notes || {}).forEach(function (id) {
      if (!QMAP[id]) return;
      var v = b.notes[id];
      var t = (typeof v === 'string') ? v : (v && v.t) || '';
      if (!t) return;
      var old = out.notes[id];
      var o = old && old.t ? old.t : '';
      var ts = Math.max((old && old.ts) || 0, (v && v.ts) || 0);
      if (!o || o === t || o.indexOf(t) >= 0) out.notes[id] = { t: o.length >= t.length ? o : t, ts: ts };
      else if (t.indexOf(o) >= 0) out.notes[id] = { t: t, ts: ts };
      else out.notes[id] = { t: t + '\n---\n' + o, ts: Math.max(Date.now(), ts) };
    });
    ['fav', 'exams'].forEach(function (k) {
      Object.keys(b[k] || {}).forEach(function (id) {
        if (out[k][id] === undefined) out[k][id] = b[k][id];
      });
    });
    Object.keys(b.wrong || {}).forEach(function (id) {
      if (!QMAP[id]) return;
      var c = b.wrong[id];
      if (typeof c !== 'number') c = 1;
      out.wrong[id] = Math.max(out.wrong[id] || 0, c);
    });
    Object.keys(b.rec || {}).forEach(function (id) {
      if (!QMAP[id]) return;
      var r = b.rec[id] || {}, o = out.rec[id] || {};
      out.rec[id] = {
        c: Math.max(o.c || 0, r.c || 0), w: Math.max(o.w || 0, r.w || 0),
        s: Math.max(o.s || 0, r.s || 0), ts: Math.max(o.ts || 0, r.ts || 0)
      };
    });
    return out;
  }

  function adoptMerged(merged) {
    store.notes = merged.notes;
    store.fav = merged.fav;
    store.wrong = merged.wrong;
    store.rec = merged.rec;
    store.exams = merged.exams;
    if (merged.last) store.last = merged.last;
    else if (store.last && store.last.mode !== 'seq') store.last = null;
    saveStore();
    renderHome();
  }

  function applyBackup(data) {
    if (!data || !data.notes) return toast('不是有效的备份文件');
    var merged = mergeStores(store, data);
    adoptMerged(merged);
    toast('已同步 ' + Object.keys(data.notes).length + ' 条批注、' +
          Object.keys(data.fav || {}).length + ' 收藏、' + Object.keys(data.wrong || {}).length + ' 错题');
  }

  /* ---------------- 云端仓库同步（sync-data 分支） ---------------- */
  var SYNC_STATE_KEY = 'anb_sync_state';
  var syncBusy = false;

  function ghToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function ghHeaders(withJson) {
    var t = ghToken();
    var h = { 'Accept': 'application/vnd.github+json' };
    if (t) h['Authorization'] = 'Bearer ' + t;
    if (withJson) h['Content-Type'] = 'application/json';
    return h;
  }
  function apiUrl(p) {
    return 'https://api.github.com/repos/' + SYNC.owner + '/' + SYNC.repo + p;
  }
  function b64ToUtf8(s) {
    var bin = atob(String(s).replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }
  function utf8ToB64(s) {
    return btoa(unescape(encodeURIComponent(s)));
  }

  function countOf(d) {
    d = d || {};
    var n = function (o) { return o ? Object.keys(o).length : 0; };
    return { notes: n(d.notes), fav: n(d.fav), wrong: n(d.wrong), rec: n(d.rec) };
  }
  // 记录"分量"指纹：数量 + 练习计数加权求和，用来判断两端是否一致
  function sigOf(d) {
    d = d || {};
    var sum = 0;
    Object.keys(d.rec || {}).forEach(function (k) {
      var r = d.rec[k] || {};
      sum += (r.c || 0) + (r.w || 0) * 7 + (r.s || 0) * 13;
    });
    return [Object.keys(d.notes || {}).length, Object.keys(d.fav || {}).length,
            Object.keys(d.wrong || {}).length, sum].join('|');
  }
  function agoText(ts) {
    if (!ts) return '';
    var sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return '刚刚';
    if (sec < 3600) return Math.floor(sec / 60) + ' 分钟前';
    if (sec < 86400) return Math.floor(sec / 3600) + ' 小时前';
    return Math.floor(sec / 86400) + ' 天前';
  }

  // 带超时的 fetch：raw.githubusercontent.com 在部分网络下会"连上但不返回"，
  // 不加超时会把整次同步永久挂住（表现为一直停在未配对/同步中）
  function fetchT(url, opts, ms) {
    opts = opts || {};
    ms = ms || 8000;
    if (typeof AbortController === 'undefined') return fetch(url, opts);
    var ac = new AbortController();
    var tid = setTimeout(function () { try { ac.abort(); } catch (e) {} }, ms);
    opts.signal = ac.signal;
    var done = function () { clearTimeout(tid); };
    return fetch(url, opts).then(function (r) { done(); return r; },
                                 function (e) { done(); throw e; });
  }

  // 读云端：走不可变的 git 数据 API（ref → tree → blob），避开 contents API 的 CDN 缓存
  function fetchCloudBlob() {
    return fetchT(apiUrl('/git/trees/' + SYNC.branch), { headers: ghHeaders(false), cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (tr) {
        var e = null;
        (tr.tree || []).forEach(function (x) {
          if (x.path === SYNC.path && x.type === 'blob') e = x;
        });
        if (!e) return { data: null, sha: null };
        return fetchT(apiUrl('/git/blobs/' + e.sha), { headers: ghHeaders(false), cache: 'no-store' })
          .then(function (r2) {
            if (!r2.ok) throw new Error('HTTP ' + r2.status);
            return r2.json();
          })
          .then(function (b) { return { data: JSON.parse(b64ToUtf8(b.content)), sha: e.sha }; });
      });
  }

  // 三条读取通道同时试：api（最新）→ raw 域名（CDN，5 分钟缓存）→ 站点内快照
  // 任意两条能通就合并，避免手机网络对某个域名不通时整条链路失败
  function fetchCloudAny() {
    var t1 = fetchCloudBlob().then(function (x) { return { d: x.data, sha: x.sha }; });
    var t2 = fetchT('https://raw.githubusercontent.com/' + SYNC.owner + '/' + SYNC.repo + '/' +
                   SYNC.branch + '/' + SYNC.path + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('raw ' + r.status); return r.json(); })
      .then(function (d) { return { d: d, sha: null }; });
    var t3 = fetchT('sync.json?ts=' + Date.now(), { cache: 'no-store' }, 6000)
      .then(function (r) { if (!r.ok) throw new Error('local ' + r.status); return r.json(); })
      .then(function (d) { return { d: d, sha: null }; });

    return Promise.all([t1.catch(function () { return null; }),
                        t2.catch(function () { return null; }),
                        t3.catch(function () { return null; })])
      .then(function (list) {
        var got = list.filter(function (x) { return x && x.d && x.d.rec; });
        if (!got.length) throw new Error('no-cloud');
        var merged = got[0].d;
        for (var i = 1; i < got.length; i++) merged = mergeStores(merged, got[i].d);
        var sha = null;
        for (var j = 0; j < list.length; j++) {
          if (list[j] && list[j].sha) { sha = list[j].sha; break; }
        }
        return { data: merged, sha: sha };
      });
  }

  function loadSyncState() {
    try { return JSON.parse(localStorage.getItem(SYNC_STATE_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveSyncState(patch) {
    var st = loadSyncState();
    Object.keys(patch || {}).forEach(function (k) { st[k] = patch[k]; });
    try { localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(st)); } catch (e) {}
    return st;
  }

  function renderSyncBar(info) {
    var dot = $('sync-dot'), title = $('sync-title'), sub = $('sync-sub'), btn = $('btn-sync');
    if (!dot || !title || !sub) return;
    var loc = countOf(store);
    var paired = !!ghToken();
    if (btn) { btn.disabled = false; btn.textContent = paired ? '同步' : '配对'; }
    var cls = 'sync-dot', t = '', s2 = '';

    if (info && info.error) {
      cls += ' bad';
      t = '读不到云端记录';
      s2 = '本机 ' + loc.wrong + ' 错题 · ' + loc.fav + ' 收藏' +
           (info.error === 'no-cloud' ? '（云端还没有数据）' : '（网络或权限问题，点「同步」重试）');
    } else if (info && info.cloud) {
      var c = info.cloud;
      cls += info.same ? ' on' : ' off';
      t = info.same ? '本机与云端一致' : '已合并云端记录';
      s2 = '本机 ' + loc.wrong + ' 错题 / ' + loc.fav + ' 收藏 · 云端 ' + c.wrong + ' / ' + c.fav +
           (info.at ? ' · ' + agoText(info.at) + '同步' : '');
      if (!paired) s2 += ' · 未配对：读的是缓存副本，且改动不上传';
    } else {
      t = '本机 ' + loc.wrong + ' 错题 · ' + loc.fav + ' 收藏';
      s2 = paired ? '点「同步」与云端合并' : '未配对：只能读到缓存副本，点「配对」可实时同步';
    }
    dot.className = cls;
    title.textContent = t;
    sub.textContent = s2;
  }

  // 拉 + 合 + 推（有令牌时）一次完成
  function syncNow(manual) {
    if (syncBusy) return Promise.resolve(null);
    if (!manual) {
      // 自动同步节流：1 分钟内不重复请求，避免频繁切页打满接口
      var prev = loadSyncState();
      if (prev.lastSync && Date.now() - prev.lastSync < 60000) {
        renderSyncBar(prev.lastResult || null);
        return Promise.resolve(null);
      }
    }
    syncBusy = true;
    var btn = $('btn-sync');
    if (btn) { btn.disabled = true; btn.textContent = '同步中…'; }
    var before = sigOf(store);

    return fetchCloudAny()
      .then(function (res) {
        var cloud = res.data || null;
        var merged = cloud ? mergeStores(store, cloud) : store;
        // 除了记录本身，断点变了（例如本机留着一条随机抽题的旧断点）也要采纳云端
        var needAdopt = sigOf(merged) !== before;
        if (!needAdopt && merged.last) {
          var lc = store.last || {};
          needAdopt = merged.last.mode !== lc.mode || merged.last.idx !== lc.idx ||
                      merged.last.bank !== lc.bank || merged.last.title !== lc.title;
        }
        if (needAdopt) adoptMerged(merged);
        var info = {
          cloud: countOf(cloud), sha: res.sha || null, at: Date.now(),
          same: cloud ? (sigOf(merged) === sigOf(cloud)) : false, pushed: false
        };
        if (!ghToken() || !cloud || info.same) return info;
        return pushMerged(merged, res.sha, 0).then(function () {
          info.pushed = true;
          info.same = true;
          info.cloud = countOf(store);   // 推送成功后云端内容 = 合并结果
          return info;
        });
      })
      .then(function (info) {
        syncBusy = false;
        saveSyncState({ lastSync: info.at, lastResult: info });
        renderSyncBar(info);
        // 未配对设备读到的是 GitHub 的共享缓存（60 秒），过期后再拉一次
        if (!ghToken()) scheduleRepull(65000);
        if (manual) {
          if (info.pushed) {
            toast('已同步：云端与本机都是 ' + countOf(store).wrong + ' 错题、' + countOf(store).fav + ' 收藏');
          } else if (info.cloud && info.cloud.rec) {
            toast('已合并云端：' + info.cloud.wrong + ' 错题、' + info.cloud.fav + ' 收藏、' + info.cloud.notes + ' 批注');
          } else {
            toast('云端还没有记录，先在本机做题');
          }
        }
        return info;
      })
      .catch(function (e) {
        syncBusy = false;
        var info = { error: (e && e.message) || 'fail' };
        renderSyncBar(info);
        if (manual) {
          toast('同步失败：' + (info.error === 'no-cloud' ? '云端还没有数据' : info.error));
        }
        return null;
      });
  }

  // 写云端：PUT 一份完整合并结果；版本冲突（422）时重读再试
  function pushMerged(merged, sha, attempt) {
    attempt = attempt || 0;
    var out = {
      app: 'anb-exam', v: 1, exported: new Date().toISOString(),
      notes: merged.notes || {}, fav: merged.fav || {}, wrong: merged.wrong || {},
      rec: merged.rec || {}, exams: merged.exams || {}, last: merged.last || null
    };
    var body = {
      message: 'sync ' + new Date().toISOString().slice(0, 19).replace('T', ' '),
      content: utf8ToB64(JSON.stringify(out)),
      branch: SYNC.branch
    };
    if (sha) body.sha = sha;
    return fetch(apiUrl('/contents/' + SYNC.path), {
      method: 'PUT', headers: ghHeaders(true), body: JSON.stringify(body)
    }).then(function (r) {
      if (r.status === 422 && attempt < 2) {
        return fetchCloudAny().then(function (res) {
          return pushMerged(mergeStores(merged, res.data || {}), res.sha, attempt + 1);
        });
      }
      if (!r.ok) {
        throw new Error('HTTP ' + r.status +
          (r.status === 401 || r.status === 403 ? '（令牌无效或无权限）' : ''));
      }
      return null;
    });
  }

  var repullTimer = null;
  function scheduleRepull(ms) {
    if (repullTimer) return;
    repullTimer = setTimeout(function () {
      repullTimer = null;
      var st = loadSyncState();
      if (st.lastSync && Date.now() - st.lastSync < ms - 5000) return;
      syncNow(false);
    }, ms);
  }

  function pullCloud() { syncNow(true); }
  function pushCloud() {
    if (!ghToken()) {
      $('btn-token').click();
      return toast('上传需要 GitHub 令牌，请先配对');
    }
    syncNow(true);
  }
  function ensureBranch() {
    return fetch(apiUrl('/git/ref/heads/' + SYNC.branch), { headers: ghHeaders(false) })
      .then(function (r) {
        if (r.ok) return null;
        return fetch(apiUrl('/git/ref/heads/main'), { headers: ghHeaders(false) })
          .then(function (r2) {
            if (!r2.ok) throw new Error('读不到主分支');
            return r2.json();
          })
          .then(function (j) {
            return fetch(apiUrl('/git/refs'), {
              method: 'POST', headers: ghHeaders(true),
              body: JSON.stringify({ ref: 'refs/heads/' + SYNC.branch, sha: j.object.sha })
            }).then(function (r3) {
              if (!r3.ok && r3.status !== 422) throw new Error('创建同步分支失败');
              return null;
            });
          });
      });
  }

  function openTokenModal() {
    var t = ghToken();
    $('token-input').value = t;
    $('token-state').textContent = t
      ? ('已设置令牌 ' + t.slice(0, 7) + '…' + t.slice(-4))
      : '未设置令牌（拉取不需要令牌，上传需要）';
    $('token-modal').hidden = false;
  }

  function importBackup(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var data;
      try { data = JSON.parse(fr.result); }
      catch (e) { return toast('文件格式不正确'); }
      applyBackup(data);
    };
    fr.readAsText(file);
  }

  /* ---------------- 图片放大 ---------------- */
  function openLightbox(src) {
    $('lightbox-img').src = src;
    $('lightbox').hidden = false;
  }
  function preload(id) {
    if (!id) return;
    var q = QMAP[id];
    if (q && q.i) { var im = new Image(); im.src = q.i; }
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    document.querySelectorAll('.bank-card').forEach(function (el) {
      el.onclick = function () { startPractice({ bank: el.getAttribute('data-bank') }); };
    });
    document.querySelectorAll('.chip').forEach(function (el) {
      el.onclick = function () { startPractice({ type: el.getAttribute('data-type') }); };
    });
    var allBank = $('btn-all-bank');
    if (allBank) allBank.onclick = function () { startPractice({ bank: 'all' }); };
    document.querySelectorAll('.exam-card').forEach(function (el) {
      el.onclick = function () { startExam(el.getAttribute('data-exam')); };
    });
    var scopeBox = $('exam-scope');
    Array.prototype.forEach.call(scopeBox.querySelectorAll('.chip'), function (c) {
      c.onclick = function () {
        examScope = c.getAttribute('data-scope');
        Array.prototype.forEach.call(scopeBox.querySelectorAll('.chip'), function (x) {
          x.classList.toggle('chip-on', x === c);
        });
        // 同步更新模考卡片文案
        var txt = examScope === 'c'
          ? { quick: '判断12 单选18', full: '判断40 单选60' }
          : { quick: '判断10 单选15 多选5', full: '判断30 单选50 多选20' };
        document.querySelector('[data-exam="quick"] em').textContent = txt.quick;
        document.querySelector('[data-exam="full"] em').textContent = txt.full;
      };
    });

    $('btn-continue').onclick = function () {
      var l = validLast(store.last);
      if (l) {
        startPractice({
          bank: l.bank, type: l.type, mode: l.mode, title: l.title,
          start: Math.min(l.idx, l.list.length - 1), restore: l, listOverride: l.list
        });
      } else {
        startPractice({ bank: 'all' });
      }
    };
    $('btn-wrong').onclick = function () { openList('wrong'); };
    $('btn-fav').onclick = function () { openList('fav'); };
    $('btn-notes').onclick = function () { openList('note'); };
    $('btn-random').onclick = function () { startPractice({ mode: 'random', limit: 30, title: '随机抽题 30' }); };
    $('fin-home').onclick = goHome;
    $('fin-wrong').onclick = function () {
      $('finish-panel').hidden = true;
      openList('wrong');
    };

    function exitQuiz() {
      if (ses && Object.keys(ses.ans).length) saveLast();
      goHome();
    }
    $('quiz-exit').onclick = exitQuiz;
    $('btn-home-q').onclick = exitQuiz;
    $('btn-submit').onclick = function () { submitMulti(curQ()); };
    $('nav-prev').onclick = prevQuiz;
    $('nav-next').onclick = nextQuiz;
    $('nav-jump').onclick = function () {
      var n = prompt('跳转到第几题？（1 - ' + ses.list.length + '）');
      if (!n) return;
      n = parseInt(n, 10);
      if (isNaN(n) || n < 1 || n > ses.list.length) return toast('题号超出范围');
      ses.idx = n - 1; ses.multiSel = null;
      saveLast(); renderQuiz(); window.scrollTo(0, 0);
    };
    $('btn-fav-q').onclick = function () {
      var q = curQ();
      if (store.fav[q.id]) { delete store.fav[q.id]; toast('已取消收藏'); }
      else { store.fav[q.id] = Date.now(); toast('已收藏'); }
      saveStore();
      renderQuiz();
      renderHome();
    };

    /* ---- 批注 ---- */
    $('btn-note-q').onclick = function () {
      noteCtxRefresh = function () { renderQuiz(); renderHome(); };
      openNote(curQ().id, false);
    };
    $('note-tags').innerHTML = NOTE_TAGS.map(function (t) {
      return '<button class="note-tag" type="button">' + t + '</button>';
    }).join('');
    Array.prototype.forEach.call($('note-tags').querySelectorAll('.note-tag'), function (b) {
      b.onclick = function () {
        var ta = $('note-input');
        var v = ta.value;
        if (v && !/[\s\n]$/.test(v)) v += ' ';
        ta.value = v + '#' + b.textContent + ' ';
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      };
    });
    $('note-close').onclick = closeNote;
    $('note-cancel').onclick = closeNote;
    $('note-save').onclick = doSaveNote;
    $('note-del').onclick = function () {
      if (!noteCtx) return;
      saveNote(noteCtx.id, '');
      closeNote();
      toast('批注已删除');
      flushNoteRefresh();
    };
    $('note-modal').onclick = function (e) { if (e.target === $('note-modal')) closeNote(); };
    $('note-input').addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doSaveNote(); }
    });

    $('export-close').onclick = function () { $('export-modal').hidden = true; };
    $('export-ok').onclick = function () { $('export-modal').hidden = true; };
    $('export-copy').onclick = function () { copyText($('export-text')); };
    $('export-modal').onclick = function (e) {
      if (e.target === $('export-modal')) $('export-modal').hidden = true;
    };

    $('btn-export-md').onclick = function () { exportNotes('md'); };
    $('btn-export-json').onclick = function () { exportNotes('json'); };
    $('btn-import').onclick = function () { $('import-file').click(); };
    $('import-file').onchange = function () {
      var f = this.files && this.files[0];
      if (f) importBackup(f);
      this.value = '';
    };
    $('btn-cloud').onclick = pullCloud;
    $('btn-push').onclick = pushCloud;
    $('btn-sync').onclick = function () {
      if (!ghToken()) {
        openTokenModal();
        return toast('先用令牌配对，手机才能把记录上传到云端');
      }
      syncNow(true);
    };
    $('sync-bar').onclick = function (e) {
      if (e.target && e.target.id === 'btn-sync') return;
      syncNow(true);
    };
    $('btn-token').onclick = openTokenModal;
    $('token-close').onclick = $('token-cancel').onclick = function () { $('token-modal').hidden = true; };
    $('token-save').onclick = function () {
      var v = $('token-input').value.trim();
      if (v && !/^(ghp_|github_pat_)/.test(v)) return toast('令牌应以 ghp_ 或 github_pat_ 开头');
      try {
        if (v) localStorage.setItem(TOKEN_KEY, v);
        else localStorage.removeItem(TOKEN_KEY);
      } catch (e) { return toast('保存失败'); }
      $('token-modal').hidden = true;
      if (v) {
        toast('令牌已保存，正在双向同步…');
        syncNow(true);
      } else {
        renderSyncBar(null);
        toast('令牌已清除');
      }
    };
    $('token-clear').onclick = function () {
      try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
      $('token-input').value = '';
      $('token-state').textContent = '未设置令牌';
      toast('令牌已清除');
    };
    $('token-modal').onclick = function (e) {
      if (e.target === $('token-modal')) $('token-modal').hidden = true;
    };

    $('exam-exit').onclick = function () {
      if (confirm('退出将放弃本次考试，确定吗？')) { stopTimer(); goHome(); }
    };
    $('e-prev').onclick = function () { examNav(-1); };
    $('e-next').onclick = function () {
      if (exam.idx === exam.list.length - 1) submitExam(false);
      else examNav(1);
    };
    $('e-sheet').onclick = openSheet;
    $('drawer-close').onclick = closeSheet;
    $('drawer-mask').onclick = function (e) { if (e.target === $('drawer-mask')) closeSheet(); };
    $('btn-handin').onclick = function () { submitExam(false); };

    $('list-back').onclick = goHome;

    $('lightbox-close').onclick = function () { $('lightbox').hidden = true; };
    $('lightbox').onclick = function (e) {
      if (e.target === $('lightbox')) $('lightbox').hidden = true;
    };

    $('btn-reset').onclick = function () {
      if (!confirm('将清空所有答题记录、错题本、收藏和批注，确定吗？\n（建议先点「备份全部记录」保存一份）')) return;
      store = { rec: {}, fav: {}, wrong: {}, notes: {}, exams: [], last: null };
      saveStore();
      renderHome();
      toast('已清空');
    };

    document.addEventListener('keydown', function (e) {
      // 批注弹窗打开时：Esc 关闭，其它键交给输入框
      if (!$('note-modal').hidden) {
        if (e.key === 'Escape') { e.preventDefault(); closeNote(); }
        return;
      }
      // 考试页：N 键写批注
      if (exam && !$('view-exam').hidden) {
        if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          noteCtxRefresh = function () { renderExam(); };
          openNote(exam.list[exam.idx], true);
        }
        return;
      }
      if (!ses || $('view-quiz').hidden) return;
      var q = curQ();
      if (!q) return;
      var answered = ses.ans[q.id] !== undefined;
      var k = e.key.toLowerCase();
      if (e.key === 'Escape') {
        // 有浮层时先关浮层（图片放大/导出面板已各自处理）
        if (!$('lightbox').hidden) { $('lightbox').hidden = true; return; }
        if (!$('export-modal').hidden) { $('export-modal').hidden = true; return; }
        if (!$('token-modal').hidden) { $('token-modal').hidden = true; return; }
        e.preventDefault(); exitQuiz(); return;
      }
      if (k === 'n' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        noteCtxRefresh = function () { renderQuiz(); renderHome(); };
        openNote(q.id, false);
        return;
      }
      var idx = -1;
      if (k >= 'a' && k <= 'e') idx = k.charCodeAt(0) - 97;
      if (k >= '1' && k <= '5') idx = parseInt(k, 10) - 1;
      if (idx >= 0 && idx < q.o.length) {
        if (answered) return;
        var btn = $('q-options').children[idx];
        if (btn) btn.click();
        return;
      }
      if (e.key === 'Enter') {
        if (!answered && q.t === 'multi') submitMulti(q);
        else if (answered) nextQuiz();
      }
      if (e.key === 'ArrowRight' && answered) nextQuiz();
      if (e.key === 'ArrowLeft') prevQuiz();
    });
  }

  /* ---------------- 启动 ---------------- */
  renderHome();
  bind();
  show('home');
  renderSyncBar(null);
  // 打开页面就自动对一次云端（失败不打扰：状态条会显示原因）
  setTimeout(function () { syncNow(false); }, 500);
  window.addEventListener('online', function () { syncNow(false); });
  // 回到前台时再对一次，手机上切回来就能看到电脑端新记录
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !syncBusy) syncNow(false);
  });
})();
