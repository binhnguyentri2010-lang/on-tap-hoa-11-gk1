/* ==========================================================================
   CHEMLAB — CORE DATA, GRADING, STORAGE & CHEMICAL APPARATUS PLATES
   Architecture & 3-Tier Resilient Storage adapted from BIOSPHERE
   ========================================================================== */
(function () {
  "use strict";

  var STORAGE_PREFIX = "chemlab_state_v1_";
  var WN_PREFIX = "CHEMLAB_WN_V1:";
  var memoryFallback = {};
  var storageWarnShown = false;

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getData() {
    var d = window.CHEMLAB_DATA;
    if (!d || !Array.isArray(d.lessons)) {
      return { doc_title: "", school_year: "", lessons: [] };
    }
    return d;
  }

  function getLesson(lessonId) {
    var lessons = getData().lessons;
    for (var i = 0; i < lessons.length; i++) {
      if (lessons[i].id === lessonId) return lessons[i];
    }
    return null;
  }

  /* --------------------------------------------------------------------------
     3-Tier Resilient Storage (localStorage -> sessionStorage -> window.name)
     Survives MPA navigation even when Safari Private / in-app WebView blocks storage
     -------------------------------------------------------------------------- */
  function readWindowNameMap() {
    try {
      var raw = window.name || "";
      if (raw.indexOf(WN_PREFIX) === 0) {
        var parsed = JSON.parse(raw.slice(WN_PREFIX.length));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (_e) {}
    return {};
  }

  function writeWindowNameMap(mapObj) {
    try {
      window.name = WN_PREFIX + JSON.stringify(mapObj || {});
    } catch (_e) {}
  }

  function createDefaultState(lessonId, firstUid) {
    return {
      version: 1,
      lessonId: lessonId,
      mode: "instant", // "instant" (Phan hoi tuc thi) | "exam" (Thi tron bai)
      currentUid: firstUid || "",
      answers: {},
      checked: {},
      flagged: {},
      notes: {},
      revealedSolutions: {},
      submitted: false,
      view: "stage", // "stage" | "results"
      reviewFilter: "all", // "all" | "wrong" | "right"
      drill: null,
      updatedAt: Date.now()
    };
  }

  function sanitizeAnswersMap(rawAnswers, validUids) {
    var clean = {};
    if (!rawAnswers || typeof rawAnswers !== "object" || Array.isArray(rawAnswers)) {
      return clean;
    }
    Object.keys(rawAnswers).forEach(function (uid) {
      var q = validUids[uid];
      if (!q) return;
      var val = rawAnswers[uid];
      if (q.part === "mcq") {
        if (val === "A" || val === "B" || val === "C" || val === "D") {
          clean[uid] = val;
        }
      } else if (q.part === "tf") {
        if (val && typeof val === "object" && !Array.isArray(val)) {
          var cleanTf = {};
          ["a", "b", "c", "d"].forEach(function (k) {
            if (typeof val[k] === "boolean") cleanTf[k] = val[k];
          });
          if (Object.keys(cleanTf).length > 0) clean[uid] = cleanTf;
        }
      } else if (q.part === "short" || q.part === "essay") {
        if (typeof val === "string" || typeof val === "number" || typeof val === "object") {
          clean[uid] = val;
        }
      }
    });
    return clean;
  }

  function sanitizeBoolMap(rawMap, validUids) {
    var clean = {};
    if (!rawMap || typeof rawMap !== "object" || Array.isArray(rawMap)) {
      return clean;
    }
    Object.keys(rawMap).forEach(function (uid) {
      if (validUids[uid] && rawMap[uid] === true) clean[uid] = true;
    });
    return clean;
  }

  function loadLessonState(lesson) {
    if (!lesson) return createDefaultState("", "");
    var key = STORAGE_PREFIX + lesson.id;
    var firstUid = lesson.questions && lesson.questions[0] ? lesson.questions[0].uid : "";
    var defaultState = createDefaultState(lesson.id, firstUid);

    var validUids = {};
    (lesson.questions || []).forEach(function (q) {
      validUids[q.uid] = q;
    });

    var raw = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch (_e1) {}

    if (!raw) {
      try {
        raw = window.sessionStorage.getItem(key);
      } catch (_e2) {}
    }

    if (!raw) {
      var wnMap = readWindowNameMap();
      if (wnMap[key]) {
        try {
          raw = JSON.stringify(wnMap[key]);
        } catch (_e3) {}
      }
    }

    if (!raw && memoryFallback[key]) {
      try {
        raw = JSON.stringify(memoryFallback[key]);
      } catch (_e4) {}
    }

    if (!raw) return defaultState;

    try {
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return defaultState;
      }

      var merged = createDefaultState(lesson.id, firstUid);
      merged.mode = parsed.mode === "exam" ? "exam" : "instant";
      merged.currentUid = validUids[parsed.currentUid] ? parsed.currentUid : firstUid;
      merged.submitted = Boolean(parsed.submitted);
      merged.view = parsed.view === "results" ? "results" : "stage";
      merged.reviewFilter = ["all", "wrong", "right"].indexOf(parsed.reviewFilter) !== -1 ? parsed.reviewFilter : "all";
      merged.answers = sanitizeAnswersMap(parsed.answers, validUids);
      merged.checked = sanitizeBoolMap(parsed.checked, validUids);
      merged.flagged = sanitizeBoolMap(parsed.flagged, validUids);
      merged.revealedSolutions = sanitizeBoolMap(parsed.revealedSolutions, validUids);
      merged.notes = (parsed.notes && typeof parsed.notes === "object") ? parsed.notes : {};

      if (parsed.drill && typeof parsed.drill === "object" && Array.isArray(parsed.drill.queue)) {
        var cleanQueue = parsed.drill.queue.filter(function (uid) {
          return Boolean(validUids[uid]);
        });
        if (cleanQueue.length > 0) {
          merged.drill = {
            queue: cleanQueue,
            idx: Math.max(0, Math.min(Number(parsed.drill.idx) || 0, cleanQueue.length - 1)),
            round: Math.max(1, Number(parsed.drill.round) || 1),
            answers: sanitizeAnswersMap(parsed.drill.answers, validUids),
            checked: sanitizeBoolMap(parsed.drill.checked, validUids)
          };
        }
      }

      return merged;
    } catch (_err) {
      return defaultState;
    }
  }

  function saveLessonState(lessonId, state) {
    if (!lessonId || !state) return;
    var key = STORAGE_PREFIX + lessonId;
    state.updatedAt = Date.now();
    memoryFallback[key] = state;
    var serialized = JSON.stringify(state);

    var savedLocal = false;
    try {
      window.localStorage.setItem(key, serialized);
      savedLocal = true;
    } catch (_errLocal) {
      savedLocal = false;
    }

    if (!savedLocal) {
      try {
        window.sessionStorage.setItem(key, serialized);
      } catch (_errSession) {}
      var wnMap = readWindowNameMap();
      wnMap[key] = state;
      writeWindowNameMap(wnMap);

      if (!storageWarnShown && typeof document !== "undefined" && document.body) {
        storageWarnShown = true;
        showToast("Trình duyệt đang tắt lưu trữ cố định — tiến độ vẫn được giữ trong phiên mở tab này.");
      }
    }
  }

  function clearLessonState(lesson) {
    if (!lesson) return createDefaultState("", "");
    var key = STORAGE_PREFIX + lesson.id;
    delete memoryFallback[key];
    try {
      window.localStorage.removeItem(key);
    } catch (_e1) {}
    try {
      window.sessionStorage.removeItem(key);
    } catch (_e2) {}
    var wnMap = readWindowNameMap();
    if (wnMap[key]) {
      delete wnMap[key];
      writeWindowNameMap(wnMap);
    }
    return createDefaultState(lesson.id, lesson.questions[0] ? lesson.questions[0].uid : "");
  }

  /* --------------------------------------------------------------------------
     Evaluation Logic: MCQ, True/False & Essay/Calculation
     -------------------------------------------------------------------------- */
  function normalizeShortAnswer(raw, expectedStr) {
    var rawStr = raw == null ? "" : String(raw);
    var trimmed = rawStr.trim();
    var exp = String(expectedStr == null ? "" : expectedStr).trim();

    if (!trimmed) {
      return { answered: false, rawTrimmed: "", normalized: "", hasInvalidChars: false };
    }

    var cleaned = trimmed.replace(/^[.,;:\s]+|[.,;:\s]+$/g, "");
    return {
      answered: true,
      rawTrimmed: trimmed,
      normalized: cleaned.toLowerCase(),
      hasInvalidChars: false
    };
  }

  function countTfPicked(q, ans) {
    if (!q || q.part !== "tf" || !ans || typeof ans !== "object") return 0;
    var stmts = q.statements || [];
    var count = 0;
    for (var i = 0; i < stmts.length; i++) {
      if (typeof ans[stmts[i].key] === "boolean") count++;
    }
    return count;
  }

  function isQuestionAnswered(q, ans) {
    if (!q || ans == null) return false;
    if (q.part === "mcq") {
      return ans === "A" || ans === "B" || ans === "C" || ans === "D";
    }
    if (q.part === "tf") {
      var stmts = q.statements || [];
      return stmts.length > 0 && countTfPicked(q, ans) === stmts.length;
    }
    if (q.part === "short" || q.part === "essay") {
      if (typeof ans === "object") return Boolean(ans.mastered != null || (ans.text && ans.text.trim().length > 0));
      return String(ans).trim().length > 0;
    }
    return false;
  }

  function hasPartialAnswer(q, ans) {
    if (!q || ans == null) return false;
    if (q.part === "tf") {
      var picked = countTfPicked(q, ans);
      var total = (q.statements || []).length;
      return picked > 0 && picked < total;
    }
    return false;
  }

  function evaluateQuestion(q, ans) {
    var answered = isQuestionAnswered(q, ans);
    if (q.part === "mcq") {
      var isRight = answered && ans === q.answer;
      return {
        answered: answered,
        partial: false,
        isCorrect: isRight,
        userAnswer: answered ? ans : null,
        expectedAnswer: q.answer
      };
    }
    if (q.part === "tf") {
      var stmts = q.statements || [];
      var subCorrect = 0;
      var pickedCount = 0;
      var details = [];
      var obj = ans && typeof ans === "object" ? ans : {};
      for (var i = 0; i < stmts.length; i++) {
        var s = stmts[i];
        var picked = typeof obj[s.key] === "boolean" ? obj[s.key] : null;
        if (picked !== null) pickedCount++;
        var expected = typeof s.expected === "boolean" ? s.expected : Boolean(s.is_true);
        var match = picked !== null && picked === expected;
        if (match) subCorrect++;
        details.push({
          key: s.key,
          marker: s.marker_verbatim,
          picked: picked,
          expected: expected,
          match: match
        });
      }
      return {
        answered: answered,
        partial: pickedCount > 0 && pickedCount < stmts.length,
        pickedCount: pickedCount,
        isCorrect: answered && subCorrect === stmts.length,
        subCorrect: subCorrect,
        subTotal: stmts.length,
        details: details
      };
    }
    if (q.part === "short" || q.part === "essay") {
      var isMastered = false;
      var userText = "";
      if (typeof ans === "object" && ans !== null) {
        isMastered = Boolean(ans.mastered);
        userText = String(ans.text || "").trim();
      } else {
        userText = String(ans || "").trim();
        isMastered = userText.length > 0;
      }
      return {
        answered: answered,
        partial: false,
        isCorrect: isMastered,
        userAnswer: userText,
        expectedAnswer: q.answer || "(Xem bài giải chi tiết)"
      };
    }
    return { answered: false, partial: false, isCorrect: false };
  }

  function computeLessonMetrics(lesson, state) {
    var questions = (lesson && lesson.questions) || [];
    var answers = (state && state.answers) || {};
    var checked = (state && state.checked) || {};
    var submitted = Boolean(state && state.submitted);

    var total = questions.length;
    var answeredCount = 0;
    var partialCount = 0;
    var gradedCount = 0;
    var correctTotal = 0;

    var mcqTotal = 0;
    var mcqCorrect = 0;
    var mcqAnswered = 0;

    var tfTotal = 0;
    var tfFullCorrect = 0;
    var tfSubTotal = 0;
    var tfSubCorrect = 0;
    var tfAnswered = 0;
    var tfPartial = 0;

    var shortTotal = 0;
    var shortCorrect = 0;
    var shortAnswered = 0;

    var wrongUids = [];
    var rightUids = [];

    // Score calculation (Scale 10)
    var earnedPoints = 0;
    var maxPoints = 0;

    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      var ans = answers[q.uid];
      var ev = evaluateQuestion(q, ans);
      var isGraded = submitted || Boolean(checked[q.uid]);

      if (ev.answered) answeredCount++;
      else if (ev.partial) partialCount++;
      if (isGraded) gradedCount++;

      if (q.part === "mcq") {
        mcqTotal++;
        maxPoints += 1.0;
        if (ev.answered) mcqAnswered++;
        if (ev.isCorrect) {
          mcqCorrect++;
          earnedPoints += 1.0;
        }
      } else if (q.part === "tf") {
        tfTotal++;
        tfSubTotal += ev.subTotal;
        maxPoints += 1.0;
        if (ev.answered) tfAnswered++;
        else if (ev.partial) tfPartial++;
        tfSubCorrect += ev.subCorrect;
        if (ev.isCorrect) tfFullCorrect++;
        if (ev.subCorrect === 1) earnedPoints += 0.1;
        else if (ev.subCorrect === 2) earnedPoints += 0.25;
        else if (ev.subCorrect === 3) earnedPoints += 0.5;
        else if (ev.subCorrect === 4) earnedPoints += 1.0;
      } else if (q.part === "short" || q.part === "essay") {
        shortTotal++;
        maxPoints += 1.0;
        if (ev.answered) shortAnswered++;
        if (ev.isCorrect) {
          shortCorrect++;
          earnedPoints += 1.0;
        }
      }

      if (ev.isCorrect) {
        correctTotal++;
        rightUids.push(q.uid);
      } else {
        wrongUids.push(q.uid);
      }
    }

    var subTotalAll = mcqTotal + tfSubTotal + shortTotal;
    var subCorrectTotal = mcqCorrect + tfSubCorrect + shortCorrect;
    var score10 = maxPoints > 0 ? Math.round((earnedPoints / maxPoints) * 100) / 10 : 0;

    var checkedWrongUids = questions
      .filter(function (q) {
        var isGraded = submitted || Boolean(checked[q.uid]);
        if (!isGraded) return false;
        return !evaluateQuestion(q, answers[q.uid]).isCorrect;
      })
      .map(function (q) {
        return q.uid;
      });

    return {
      total: total,
      answeredCount: answeredCount,
      partialCount: partialCount,
      gradedCount: gradedCount,
      correctTotal: correctTotal,
      mcqTotal: mcqTotal,
      mcqCorrect: mcqCorrect,
      mcqAnswered: mcqAnswered,
      tfTotal: tfTotal,
      tfFullCorrect: tfFullCorrect,
      tfSubTotal: tfSubTotal,
      tfSubCorrect: tfSubCorrect,
      tfAnswered: tfAnswered,
      tfPartial: tfPartial,
      shortTotal: shortTotal,
      shortCorrect: shortCorrect,
      shortAnswered: shortAnswered,
      score10: score10,
      subTotalAll: subTotalAll,
      subCorrectTotal: subCorrectTotal,
      wrongUids: wrongUids,
      rightUids: rightUids,
      checkedWrongUids: checkedWrongUids,
      touchedCount: answeredCount + partialCount
    };
  }

  function renderStemBlocksHtml(q) {
    if (!q || !Array.isArray(q.stem_blocks)) return "";
    return q.stem_blocks
      .map(function (b) {
        if (b.type === "html" || b.type === "text") {
          return '<div class="stem-paragraph">' + (b.html || escapeHtml(b.plain)) + "</div>";
        }
        return "";
      })
      .join("");
  }

  function showToast(msg) {
    var existing = document.getElementById("chemlab-toast");
    if (existing) existing.remove();
    var toast = document.createElement("div");
    toast.id = "chemlab-toast";
    toast.className = "chemlab-toast";
    toast.setAttribute("role", "status");
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(function () {
      toast.classList.add("is-visible");
    });
    setTimeout(function () {
      toast.classList.remove("is-visible");
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 2800);
  }

  function shareLink(title, text, url) {
    if (navigator.share && typeof navigator.share === "function") {
      navigator.share({ title: title, text: text, url: url }).catch(function () {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        showToast("Đã sao chép liên kết vào bộ nhớ tạm!");
      }).catch(function () {
        showToast("Không thể tự sao chép — bạn hãy sao chép URL trên thanh địa chỉ.");
      });
    } else {
      showToast("Bạn hãy sao chép URL trên thanh địa chỉ trình duyệt.");
    }
  }

  /* --------------------------------------------------------------------------
     ChatGPT Prompt Generator: Rich Context for Deep Explanation
     -------------------------------------------------------------------------- */
  function generateChatGptPrompt(lesson, state) {
    if (!lesson || !state) return "";
    var m = computeLessonMetrics(lesson, state);
    var questions = lesson.questions || [];
    var answers = state.answers || {};
    var flagged = state.flagged || {};

    var lines = [];
    lines.push("# YÊU CẦU CHẤM VÀ GIẢI THÍCH CHI TIẾT ÔN TẬP HÓA HỌC 11 GIỮA KỲ I");
    lines.push("");
    lines.push("Chào ChatGPT, mình vừa hoàn thành bài kiểm tra ôn tập Hóa học 11 Giữa kỳ I sau đây:");
    lines.push("- **Bài thi**: " + lesson.title_full);
    lines.push("- **Điểm số**: " + m.score10 + "/10 điểm");
    lines.push("- **Kết quả**: Đúng trọn vẹn " + m.correctTotal + "/" + m.total + " câu (Tổng số ý đúng: " + m.subCorrectTotal + "/" + m.subTotalAll + " ý)");
    lines.push("- **Danh sách câu sai**: " + (m.wrongUids.length > 0 ? m.wrongUids.join(", ") : "Không có câu sai nào"));
    
    var flaggedUids = Object.keys(flagged).filter(function (uid) { return flagged[uid]; });
    lines.push("- **Các câu cần giải thích sâu (đánh dấu)**: " + (flaggedUids.length > 0 ? flaggedUids.join(", ") : "Không có"));
    lines.push("");
    lines.push("## TỔNG HỢP TOÀN BỘ ĐÁP ÁN ĐÃ CHỌN:");
    
    var answerSummary = [];
    questions.forEach(function (q) {
      var ans = answers[q.uid];
      if (q.part === "mcq") {
        answerSummary.push(q.number + (ans || "_"));
      } else if (q.part === "tf") {
        var tfStr = ["a", "b", "c", "d"].map(function (k) {
          var val = ans && ans[k];
          return k + ":" + (val === true ? "Đ" : val === false ? "S" : "_");
        }).join(", ");
        answerSummary.push("Câu " + q.number + " (" + tfStr + ")");
      } else {
        var textAns = typeof ans === "object" && ans ? (ans.text || (ans.mastered ? "Đã thuộc" : "_")) : (ans || "_");
        answerSummary.push("Bài " + q.number + ": " + textAns);
      }
    });
    lines.push(answerSummary.join(" | "));
    lines.push("");

    var needDeepReview = questions.filter(function (q) {
      var ev = evaluateQuestion(q, answers[q.uid]);
      return !ev.isCorrect || flagged[q.uid];
    });

    if (needDeepReview.length > 0) {
      lines.push("## CHI TIẾT CÁC CÂU LÀM SAI HOẶC CẦN PHÂN TÍCH KỸ LƯỠNG:");
      needDeepReview.forEach(function (q, idx) {
        var ev = evaluateQuestion(q, answers[q.uid]);
        lines.push("");
        lines.push("### " + (idx + 1) + ". [" + q.label_verbatim + "]");
        lines.push("**Đề bài:**");
        (q.stem_blocks || []).forEach(function (b) {
          lines.push(b.plain || "");
        });

        if (q.part === "mcq") {
          lines.push("**Các lựa chọn:**");
          (q.options || []).forEach(function (opt) {
            lines.push("- " + opt.prefix_verbatim + " " + opt.plain + (opt.is_correct ? " (Đáp án chuẩn)" : ""));
          });
          lines.push("- **Đáp án học sinh chọn:** " + (ev.userAnswer || "Bỏ trống"));
          lines.push("- **Đáp án chính xác:** " + q.answer);
          if (q.explanation) lines.push("- **Giải thích trong đề cương:** " + q.explanation);
        } else if (q.part === "tf") {
          lines.push("**Mệnh đề & đối chiếu:**");
          (q.statements || []).forEach(function (s, sIdx) {
            var dItem = ev.details && ev.details[sIdx];
            var pStr = dItem && dItem.picked === true ? "Đúng" : dItem && dItem.picked === false ? "Sai" : "Bỏ trống";
            var eStr = (typeof s.expected === "boolean" ? s.expected : Boolean(s.is_true)) ? "Đúng" : "Sai";
            lines.push("- " + s.marker_verbatim + " " + s.plain + " -> Học sinh: [" + pStr + "] | Chuẩn: [" + eStr + "]" + (s.explanation ? " (" + s.explanation + ")" : ""));
          });
        } else {
          lines.push("- **Bài giải của học sinh:** " + (ev.userAnswer || "Chưa nhập"));
          lines.push("- **Đáp số / hướng dẫn chuẩn:** " + (q.answer || ""));
          if (q.solution) {
            if (Array.isArray(q.solution.steps)) {
              lines.push("- **Các bước giải chi tiết:**");
              q.solution.steps.forEach(function (step) {
                if (typeof step === "object" && step !== null) {
                  var sNum = step.stepNumber || "";
                  var sTitle = step.title ? " (" + step.title + ")" : "";
                  lines.push("  + Bước " + sNum + sTitle + ":");
                  if (step.content) lines.push("    " + step.content.replace(/\n/g, "\n    "));
                } else {
                  lines.push("  + " + step);
                }
              });
            }
            if (q.solution.casio_tip) {
              lines.push("- **Mẹo bấm Casio fx-880BTG:** " + q.solution.casio_tip);
            }
          }
        }
      });
    }

    lines.push("");
    lines.push("## YÊU CẦU DÀNH CHO BẠN:");
    lines.push("1. Phân tích nguyên nhân học sinh chọn nhầm ở các câu sai trên (bẫy cân bằng Le Chatelier, pH, chất điện ly, phản ứng ion, hay đơn vị tính).");
    lines.push("2. Cung cấp phương pháp nhận dạng và mẹo ghi nhớ nhanh chuẩn SGK Kết nối tri thức.");
    lines.push("3. Hướng dẫn bấm máy tính Casio fx-880BTG cho các bài toán tính pH hoặc hằng số cân bằng Kc nếu có.");
    return lines.join("\n");
  }

  /* --------------------------------------------------------------------------
     Chemical Apparatus SVG Illustrations
     -------------------------------------------------------------------------- */
  function getChemicalSvg(id) {
    if (id === "flask" || id === "bai-1") {
      return '<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" class="chem-svg-art"><path d="M52 20h16v24l26 50a10 10 0 01-8.7 14.5H34.7A10 10 0 0126 94l26-50V20z" fill="#E0F2FE" stroke="#0284C7" stroke-width="4" stroke-linejoin="round"/><path d="M48 20h24" stroke="#0284C7" stroke-width="4" stroke-linecap="round"/><path d="M31 85l10-18h38l10 18a10 10 0 01-8.7 13.5H39.7A10 10 0 0131 85z" fill="#38BDF8" opacity="0.6"/><circle cx="50" cy="86" r="3.5" fill="#FFFFFF" opacity="0.8"/><circle cx="66" cy="78" r="4.5" fill="#FFFFFF" opacity="0.8"/><circle cx="72" cy="90" r="3" fill="#FFFFFF" opacity="0.8"/><line x1="60" y1="55" x2="68" y2="55" stroke="#0284C7" stroke-width="2" stroke-linecap="round"/><line x1="58" y1="64" x2="70" y2="64" stroke="#0284C7" stroke-width="2" stroke-linecap="round"/><line x1="54" y1="73" x2="74" y2="73" stroke="#0284C7" stroke-width="2" stroke-linecap="round"/></svg>';
    }
    if (id === "beaker" || id === "bai-2") {
      return '<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" class="chem-svg-art"><path d="M32 24h56v72a10 10 0 01-10 10H42a10 10 0 01-10-10V24z" fill="#F0FDF4" stroke="#16A34A" stroke-width="4" stroke-linejoin="round"/><path d="M28 24h64" stroke="#16A34A" stroke-width="4" stroke-linecap="round"/><path d="M32 58h56v38a10 10 0 01-10 10H42a10 10 0 01-10-10V58z" fill="#86EFAC" opacity="0.55"/><circle cx="48" cy="75" r="4" fill="#FFFFFF" opacity="0.8"/><circle cx="68" cy="68" r="5" fill="#FFFFFF" opacity="0.8"/><line x1="32" y1="40" x2="44" y2="40" stroke="#16A34A" stroke-width="2.5" stroke-linecap="round"/><line x1="32" y1="55" x2="48" y2="55" stroke="#16A34A" stroke-width="2.5" stroke-linecap="round"/><line x1="32" y1="70" x2="44" y2="70" stroke="#16A34A" stroke-width="2.5" stroke-linecap="round"/><line x1="32" y1="85" x2="48" y2="85" stroke="#16A34A" stroke-width="2.5" stroke-linecap="round"/></svg>';
    }
    if (id === "test_tubes" || id === "bai-3") {
      return '<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" class="chem-svg-art"><rect x="22" y="88" width="76" height="8" rx="3" fill="#0F172A"/><rect x="30" y="32" width="60" height="6" rx="2" fill="#0F172A"/><path d="M40 24v58a6 6 0 0012 0V24" stroke="#6366F1" stroke-width="4" fill="#EEF2FF"/><path d="M40 50v32a6 6 0 0012 0V50z" fill="#818CF8" opacity="0.6"/><path d="M68 24v58a6 6 0 0012 0V24" stroke="#EC4899" stroke-width="4" fill="#FDF2F8"/><path d="M68 44v38a6 6 0 0012 0V44z" fill="#F472B6" opacity="0.6"/><circle cx="46" cy="65" r="2.5" fill="#FFFFFF" opacity="0.9"/><circle cx="74" cy="60" r="2.5" fill="#FFFFFF" opacity="0.9"/></svg>';
    }
    if (id === "atom" || id === "bai-4") {
      return '<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" class="chem-svg-art"><ellipse cx="60" cy="60" rx="48" ry="18" stroke="#F59E0B" stroke-width="3" stroke-dasharray="4 2" transform="rotate(30 60 60)"/><ellipse cx="60" cy="60" rx="48" ry="18" stroke="#06B6D4" stroke-width="3" stroke-dasharray="4 2" transform="rotate(-30 60 60)"/><ellipse cx="60" cy="60" rx="48" ry="18" stroke="#8B5CF6" stroke-width="3" stroke-dasharray="4 2" transform="rotate(90 60 60)"/><circle cx="60" cy="60" r="10" fill="#EF4444"/><circle cx="57" cy="57" r="3" fill="#FFFFFF" opacity="0.8"/><circle cx="95" cy="42" r="5" fill="#F59E0B"/><circle cx="25" cy="78" r="5" fill="#06B6D4"/><circle cx="60" cy="12" r="5" fill="#8B5CF6"/></svg>';
    }
    if (id === "balance" || id === "bai-5") {
      return '<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" class="chem-svg-art"><rect x="56" y="28" width="8" height="66" rx="2" fill="#0F172A"/><rect x="36" y="94" width="48" height="10" rx="4" fill="#0F172A"/><path d="M24 38l72-6" stroke="#0F172A" stroke-width="4" stroke-linecap="round"/><path d="M24 38l-10 26h20L24 38z" fill="#E2E8F0" stroke="#0284C7" stroke-width="2"/><path d="M96 32l-10 26h20L96 32z" fill="#E2E8F0" stroke="#0284C7" stroke-width="2"/><circle cx="24" cy="38" r="4" fill="#0284C7"/><circle cx="96" cy="32" r="4" fill="#0284C7"/><circle cx="60" cy="35" r="5" fill="#EF4444"/></svg>';
    }
    if (id === "flame" || id === "bai-6") {
      return '<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" class="chem-svg-art"><rect x="50" y="72" width="20" height="28" rx="2" fill="#475569" stroke="#0F172A" stroke-width="2"/><rect x="38" y="100" width="44" height="8" rx="3" fill="#0F172A"/><ellipse cx="60" cy="72" rx="10" ry="4" fill="#94A3B8"/><path d="M60 16c8 16 22 26 22 38a22 22 0 11-44 0c0-12 14-22 22-38z" fill="#F97316"/><path d="M60 32c5 10 13 16 13 24a13 13 0 11-26 0c0-8 8-14 13-24z" fill="#FDE047"/><path d="M60 46c3 5 7 9 7 14a7 7 0 11-14 0c0-5 4-9 7-14z" fill="#38BDF8"/></svg>';
    }
    // Default tu-luan / book
    return '<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" class="chem-svg-art"><path d="M24 28c18-6 32 0 36 6v58c-4-6-18-12-36-6V28z" fill="#EDE9FE" stroke="#7C3AED" stroke-width="3.5" stroke-linejoin="round"/><path d="M96 28c-18-6-32 0-36 6v58c4-6 18-12 36-6V28z" fill="#DDD6FE" stroke="#7C3AED" stroke-width="3.5" stroke-linejoin="round"/><path d="M34 44h18M34 54h14M34 64h18" stroke="#7C3AED" stroke-width="2.5" stroke-linecap="round"/><path d="M68 44h18M68 54h14M68 64h18" stroke="#7C3AED" stroke-width="2.5" stroke-linecap="round"/><circle cx="60" cy="34" r="4" fill="#F59E0B"/></svg>';
  }

  window.CHEMLAB_CORE = {
    escapeHtml: escapeHtml,
    getData: getData,
    getLesson: getLesson,
    loadLessonState: loadLessonState,
    saveLessonState: saveLessonState,
    clearLessonState: clearLessonState,
    normalizeShortAnswer: normalizeShortAnswer,
    countTfPicked: countTfPicked,
    isQuestionAnswered: isQuestionAnswered,
    hasPartialAnswer: hasPartialAnswer,
    evaluateQuestion: evaluateQuestion,
    computeLessonMetrics: computeLessonMetrics,
    renderStemBlocksHtml: renderStemBlocksHtml,
    shareLink: shareLink,
    showToast: showToast,
    generateChatGptPrompt: generateChatGptPrompt,
    getChemicalSvg: getChemicalSvg
  };
})();
