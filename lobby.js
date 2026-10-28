/* ==========================================================================
   CHEMLAB — POSTER LOBBY CONTROLLER (index.html)
   7 Independent Chemistry Lessons Specimen Plates
   ========================================================================== */
(function () {
  "use strict";

  var CORE = window.CHEMLAB_CORE;

  function renderLobby() {
    if (!CORE) return;
    var data = CORE.getData();
    var lessons = data.lessons || [];
    var grid = document.getElementById("specimen-plates-grid");
    var ledgerList = document.getElementById("independent-ledger-list");
    var ledgerCaption = document.getElementById("overall-stat-caption");
    if (!grid) return;

    var completedLessons = 0;
    var startedLessons = 0;
    var cardsHtml = [];
    var ledgerRowsHtml = [];

    for (var i = 0; i < lessons.length; i++) {
      var lesson = lessons[i];
      var state = CORE.loadLessonState(lesson);
      var m = CORE.computeLessonMetrics(lesson, state);

      if (state.submitted) completedLessons++;
      if (m.touchedCount > 0 || state.submitted) startedLessons++;

      var pct = m.total > 0 ? Math.round((m.answeredCount / m.total) * 100) : 0;

      var statusLeft = "Chưa làm";
      var statusRight = "0 / " + m.total + " câu";
      var ledgerStatus = "0 / " + m.total + " câu";
      var primaryLabel = "Bắt đầu " + (lesson.id === "tu-luan" ? "Tự luận" : "Bài " + lesson.number);
      var primaryHref = "./" + lesson.slug;

      if (state.submitted) {
        statusLeft = "Đã nộp: " + m.correctTotal + "/" + m.total + " câu đúng";
        statusRight = m.score10 + "/10 điểm";
        ledgerStatus = m.score10 + "/10 điểm (" + m.correctTotal + "/" + m.total + " câu)";
        primaryLabel = m.wrongUids.length === 0 ? "Xem lại bài (Đạt 100%)" : "Mở lại " + (lesson.id === "tu-luan" ? "Tự luận" : "Bài " + lesson.number);
      } else if (m.answeredCount > 0) {
        statusLeft = state.drill ? "Đang luyện câu sai" : "Đang làm dở";
        statusRight = m.answeredCount + " / " + m.total + " câu";
        ledgerStatus = "Đã làm " + m.answeredCount + "/" + m.total + " câu";
        primaryLabel = "Làm tiếp (" + m.answeredCount + "/" + m.total + ")";
      } else if (m.partialCount > 0) {
        statusLeft = "Đang chọn dở";
        statusRight = m.partialCount + " câu chọn dở";
        ledgerStatus = "Chọn dở " + m.partialCount + " câu";
        primaryLabel = "Làm tiếp " + (lesson.id === "tu-luan" ? "Tự luận" : "Bài " + lesson.number);
      }

      ledgerRowsHtml.push(
        '<div class="ledger-lesson-row">' +
          '<span class="ledger-lesson-name">' +
          (lesson.id === "tu-luan" ? "Tự luận" : "Bài " + CORE.escapeHtml(lesson.number)) +
          "</span>" +
          '<span class="ledger-lesson-val' +
          (state.submitted ? " is-done" : m.touchedCount > 0 ? " is-active" : "") +
          '">' +
          CORE.escapeHtml(ledgerStatus) +
          "</span>" +
          "</div>"
      );

      var secondaryButtons = [];
      if (state.submitted) {
        secondaryButtons.push(
          '<a class="btn-results-plate" href="./' +
            CORE.escapeHtml(lesson.slug) +
            '?view=results">Bảng kết quả</a>'
        );
        if (m.wrongUids.length > 0) {
          secondaryButtons.push(
            '<a class="btn-retry-plate" href="./' +
              CORE.escapeHtml(lesson.slug) +
              '?retry=wrong">Luyện riêng ' +
              m.wrongUids.length +
              " câu sai</a>"
          );
        }
      } else if (m.checkedWrongUids.length > 0) {
        secondaryButtons.push(
          '<a class="btn-retry-plate" href="./' +
            CORE.escapeHtml(lesson.slug) +
            '?retry=wrong">Luyện ' +
            m.checkedWrongUids.length +
            " câu vừa sai</a>"
        );
      }

      var badgeCode = lesson.id === "tu-luan" ? "TỰ LUẬN" : "BÀI 0" + lesson.number;

      var breakdownHtml = "";
      if (lesson.id === "tu-luan") {
        breakdownHtml = '<span class="part-chip">8 bài tính toán có lời giải từng bước</span><span class="part-chip">Kèm mẹo bấm máy Casio fx-880BTG</span>';
      } else if (lesson.id === "bai-5" || lesson.id === "bai-6") {
        breakdownHtml = '<span class="part-chip">5 câu lớn · 20 mệnh đề a, b, c, d</span><span class="part-chip">Chấm điểm từng mệnh đề</span>';
      } else {
        breakdownHtml = '<span class="part-chip">22 câu trắc nghiệm ABCD</span><span class="part-chip">Chuẩn SGK Kết nối tri thức</span>';
      }

      cardsHtml.push(
        '<article class="specimen-plate" data-lesson-card="' +
          CORE.escapeHtml(lesson.id) +
          '">' +
          '<div class="plate-top-group">' +
          '<div class="plate-header">' +
          '<span class="plate-badge">' +
          CORE.escapeHtml(badgeCode) +
          "</span>" +
          '<span class="plate-count-pill">' +
          m.total +
          " câu độc lập</span>" +
          "</div>" +
          '<div class="plate-illustration">' +
          CORE.getChemicalSvg(lesson.id) +
          "</div>" +
          '<h2 class="plate-title">' +
          CORE.escapeHtml(lesson.title_full) +
          "</h2>" +
          '<div class="plate-parts-breakdown">' +
          breakdownHtml +
          "</div>" +
          "</div>" +
          '<div class="plate-bottom-group">' +
          '<div class="plate-progress-box">' +
          '<div class="plate-progress-meta">' +
          "<span>" +
          CORE.escapeHtml(statusLeft) +
          "</span>" +
          '<span class="plate-progress-right">' +
          CORE.escapeHtml(statusRight) +
          "</span>" +
          "</div>" +
          '<div class="plate-vein-bar"><div class="plate-vein-fill" style="width:' +
          pct +
          '%"></div></div>' +
          "</div>" +
          '<div class="plate-actions">' +
          '<div class="plate-primary-row">' +
          '<a class="btn-open-plate" href="' +
          CORE.escapeHtml(primaryHref) +
          '">' +
          CORE.escapeHtml(primaryLabel) +
          "</a>" +
          '<button type="button" class="btn-share-plate" data-share-lesson="' +
          CORE.escapeHtml(lesson.slug) +
          '" data-share-title="' +
          CORE.escapeHtml(lesson.title_full + " — Hóa học 11 Giữa HKI") +
          '" aria-label="Chia sẻ ' +
          CORE.escapeHtml(lesson.title_full) +
          '">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>' +
          "<span>Chia sẻ</span>" +
          "</button>" +
          "</div>" +
          (secondaryButtons.length > 0
            ? '<div class="plate-secondary-row">' + secondaryButtons.join("") + "</div>"
            : "") +
          "</div>" +
          "</div>" +
          "</article>"
      );
    }

    grid.innerHTML = cardsHtml.join("");
    if (ledgerList) {
      ledgerList.innerHTML = ledgerRowsHtml.join("");
    }
    if (ledgerCaption) {
      if (startedLessons === 0) {
        ledgerCaption.textContent = "Mỗi bài tự lưu tiến độ độc lập trên thiết bị của bạn.";
      } else {
        ledgerCaption.textContent =
          "Đã mở " + startedLessons + "/7 bài ôn tập · Đã nộp hoàn tất " + completedLessons + "/7 bài.";
      }
    }
  }

  function bindLobbyEvents() {
    var shareMainBtn = document.getElementById("btn-share-lobby");
    if (shareMainBtn) {
      shareMainBtn.addEventListener("click", function () {
        CORE.shareLink(
          "CHEMLAB — Ôn tập Hóa học 11 Giữa HKI (2026 - 2027)",
          "Bộ đề ôn tập Kiểm tra Giữa HKI Hóa học 11 (6 bài trắc nghiệm & Tự luận):",
          "./index.html"
        );
      });
    }

    document.addEventListener("click", function (ev) {
      var shareBtn = ev.target.closest("[data-share-lesson]");
      if (shareBtn) {
        ev.preventDefault();
        var slug = shareBtn.getAttribute("data-share-lesson");
        var title = shareBtn.getAttribute("data-share-title");
        CORE.shareLink(title, "Cùng ôn tập " + title, "./" + slug);
      }
    });

    window.addEventListener("pageshow", renderLobby);
    window.addEventListener("storage", renderLobby);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      renderLobby();
      bindLobbyEvents();
    });
  } else {
    renderLobby();
    bindLobbyEvents();
  }
})();
