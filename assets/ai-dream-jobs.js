(function () {
  const cfg = window.AI_DREAM_JOBS_CFG || {};
  const root = document.getElementById("ai-dream-jobs-root");
  if (!root) return;

  const chatSource = document.getElementById("ai-dream-jobs-chat-source");

  let jobs = [];          // raw 10 jobs entered
  let ranking = [];       // ranked order
  let resultData = null;  // { top3, analysis, id }
  let step = "input";     // "input" -> "rank" -> "results"

  // ---------- Small helper ----------

  function el(tag, cls, txt) {
    const x = document.createElement(tag);
    if (cls) x.className = cls;
    if (txt !== undefined && txt !== null) x.textContent = txt;
    return x;
  }

  // ---------- Drag & Drop for ranking ----------

  function makeItem(job) {
    const li = el("li", "cq-item");
    li.dataset.job = job;

    const handle = el("span", "cq-handle", "☰");
    const text = el("span", "cq-label", job);
    const pill = el("span", "cq-rankpill", "");

    li.appendChild(handle);
    li.appendChild(text);
    li.appendChild(pill);

    return li;
  }

  function enableDnD(list) {
    let dragEl = null;
    let ghost = null;
    let startY = 0;

    function updatePills() {
      const items = Array.from(list.querySelectorAll(".cq-item"));
      const total = items.length || 1;
      items.forEach((li, i) => {
        const pill = li.querySelector(".cq-rankpill");
        if (pill) pill.textContent = `${i + 1} of ${total}`;
      });
    }

    function getDragAfterElement(container, y) {
      const els = Array.from(
        container.querySelectorAll(".cq-item:not(.dragging)")
      );
      return els.reduce(
        (closest, child) => {
          const box = child.getBoundingClientRect();
          const offset = y - box.top - box.height / 2;
          if (offset < 0 && offset > closest.offset) {
            return { offset, element: child };
          }
          return closest;
        },
        { offset: Number.NEGATIVE_INFINITY, element: null }
      ).element;
    }

    function onPointerDown(e) {
      const targetItem = e.target.closest(".cq-item");
      if (!targetItem || !list.contains(targetItem)) return;

      e.preventDefault();
      dragEl = targetItem;
      dragEl.classList.add("dragging");
      startY = e.clientY;

      ghost = document.createElement("div");
      ghost.className = "cq-ghost";
      dragEl.after(ghost);

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    }

    function onPointerMove(e) {
      if (!dragEl) return;
      e.preventDefault();

      const after = getDragAfterElement(list, e.clientY);
      if (!ghost) {
        ghost = document.createElement("div");
        ghost.className = "cq-ghost";
      }
      if (after == null) list.appendChild(ghost);
      else list.insertBefore(ghost, after);
    }

    function onPointerUp(e) {
      if (!dragEl) return;
      e.preventDefault();

      if (ghost) {
        list.insertBefore(dragEl, ghost);
        ghost.remove();
        ghost = null;
      }

      dragEl.classList.remove("dragging");
      dragEl = null;

      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);

      updatePills();
    }

    list.addEventListener("pointerdown", onPointerDown);

    // initial pill labels
    updatePills();
  }

  // ---------- Screen 1: enter 5 dream jobs ----------

  function renderInput() {
    const wrap = el("div", "cq-wrap");
    const card = el("div", "cq-card");

    const head = el("div", "cq-header");
    head.appendChild(el("h2", "cq-title", "Step 1: Your dream jobs"));
    card.appendChild(head);

    card.appendChild(
      el(
        "p",
        "cq-sub",
        "Type up to 5 jobs you’d really love to do one day. Don’t overthink it – just write what excites you."
      )
    );

    const inputsWrap = el("div", "cq-inputs-vertical");

    const existing = jobs.length ? jobs : Array(5).fill("");
    for (let i = 0; i < 5; i++) {
      const row = el("div", "cq-input-row");
      const label = el("label", "", `Job ${i + 1}`);
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "e.g. Architect, Game Developer, Nurse…";
      input.value = existing[i] || "";
      row.appendChild(label);
      row.appendChild(input);
      inputsWrap.appendChild(row);
    }

    card.appendChild(inputsWrap);

    const actions = el("div", "cq-actions");
    const nextBtn = el("button", "cq-btn", "Next: Rank my jobs");
    nextBtn.disabled = true;
    actions.appendChild(nextBtn);
    card.appendChild(actions);

    // validation – require 5 non-empty entries
    function updateCanProceed() {
      const vals = Array.from(
        inputsWrap.querySelectorAll("input")
      ).map((i) => i.value.trim());
      const filled = vals.filter((v) => v !== "");
      nextBtn.disabled = filled.length < 5;
    }

    inputsWrap.addEventListener("input", updateCanProceed);
    updateCanProceed();

    nextBtn.onclick = () => {
      const vals = Array.from(
        inputsWrap.querySelectorAll("input")
      ).map((i) => i.value.trim());
      jobs = vals.filter((v) => v !== "").slice(0, 5);
      ranking = [...jobs];
      step = "rank";
      mount();
    };

    wrap.appendChild(card);
    root.replaceChildren(wrap);
  }

  // ---------- Screen 2: drag-to-rank ----------

  function renderRank() {
    const wrap = el("div", "cq-wrap");
    const card = el("div", "cq-card");

    const head = el("div", "cq-header");
    head.appendChild(el("h2", "cq-title", "Step 2: Rank your jobs"));
    card.appendChild(head);

    card.appendChild(
      el(
        "p",
        "cq-sub",
        "Drag the jobs so the one you’d most love to do is at the top, and the least appealing is at the bottom."
      )
    );

    const list = el("ul", "cq-list");
    ranking.forEach((job) => {
      list.appendChild(makeItem(job));
    });
    enableDnD(list);
    card.appendChild(list);

    const actions = el("div", "cq-actions");
    const backBtn = el("button", "cq-btn", "Back");
    backBtn.onclick = () => {
      step = "input";
      mount();
    };
    const nextBtn = el("button", "cq-btn", "Next: See AI feedback");
    actions.appendChild(backBtn);
    actions.appendChild(nextBtn);
    card.appendChild(actions);

    nextBtn.onclick = async () => {
      const order = Array.from(list.querySelectorAll(".cq-item")).map(
        (li) => li.dataset.job
      );
      ranking = order;

      try {
  nextBtn.disabled = true;
  nextBtn.textContent = "Thinking…";

  const payload = {
    nonce: cfg.nonce || "",
    name: cfg.user || "",
    email: cfg.email || "",
    jobs: jobs,
    ranking: ranking,
  };

  const res = await fetch(cfg.restUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  // Read as text first — helps when PHP sends HTML errors or warnings
  const raw = await res.text();
  let j = null;
  try {
    j = raw ? JSON.parse(raw) : null;
  } catch (e) {
    throw new Error(
      `Server returned non-JSON (${res.status}): ` +
      raw.slice(0, 280)
    );
  }

  if (!res.ok || !j || j.ok !== true) {
    throw new Error((j && j.error) || `${res.status} ${res.statusText}`);
  }

  resultData = j;
  step = "results";
  mount();

} catch (err) {
  alert("Saving / AI analysis failed: " + err.message);
} finally {
  nextBtn.disabled = false;
  nextBtn.textContent = "Next: See AI feedback";
}

    };

    wrap.appendChild(card);
    root.replaceChildren(wrap);
  }

  // ---------- Screen 3: AI feedback + chat ----------

  function renderResults() {
    const wrap = el("div", "cq-wrap");
    const card = el("div", "cq-card");

    const head = el("div", "cq-header");
    head.appendChild(el("h2", "cq-title", "Your dream jobs – and what they say about you"));
    card.appendChild(head);

    const top5 = (resultData && resultData.top5) || ranking.slice(0, 5);
    const analysis = (resultData && resultData.analysis) || "";

    // Show the student’s top 5
    if (top5 && top5.length) {
      const list = el("ul", "cq-list cq-list-small");
      top5.forEach((job, i) => {
        const li = el("li", "cq-item cq-item-static");
        const rank = el("span", "cq-rankpill", `#${i + 1}`);
        const label = el("span", "cq-label", job);
        li.appendChild(rank);
        li.appendChild(label);
        list.appendChild(li);
      });
      card.appendChild(
        el(
          "p",
          "cq-sub",
          "Here are your dream jobs:"
        )
      );
      card.appendChild(list);
    }

    // AI explanation text
    const analysisBox = el("div", "cq-analysis");
    if (analysis) {
      const p = el("p", "cq-analysis-text", analysis);
      analysisBox.appendChild(p);
    } else {
      analysisBox.appendChild(
        el(
          "p",
          "cq-analysis-text",
          "We couldn’t fetch AI feedback right now, but you can still use the chat below to ask questions about your jobs."
        )
      );
    }
    card.appendChild(analysisBox);

        // AI chat – move the already-rendered chatbot into this card
    if (chatSource && chatSource.firstChild) {
      const chatTitle = el(
        "h3",
        "cq-chat-title",
        "Chat with an AI careers guide"
      );
      const chatIntro = el(
        "p",
        "cq-chat-sub",
        "Ask questions about these jobs, what skills they use day-to-day, or how you could start exploring them."
      );
      const chatWrap = el("div", "cq-chatwrap");

      // Move all children from the hidden source container into our wrap.
      // This keeps AI Engine's event handlers intact.
      while (chatSource.firstChild) {
        chatWrap.appendChild(chatSource.firstChild);
      }

      card.appendChild(chatTitle);
      card.appendChild(chatIntro);
      card.appendChild(chatWrap);
    }


    wrap.appendChild(card);
    root.replaceChildren(wrap);
  }

  // ---------- Mount ----------

  function mount() {
    if (step === "input") renderInput();
    else if (step === "rank") renderRank();
    else renderResults();
  }

  mount();
})();
