(function () {
  const cfg = window.AI_DREAM_JOBS_CFG || {};
  const root = document.getElementById("ai-dream-jobs-root");
  if (!root) return;

  const chatSource = document.getElementById("ai-dream-jobs-chat-source");

  let jobs = [];
  let ranking = [];
  let resultData = null;
  let step = "loading"; // Start with loading to check status

  function el(tag, cls, txt) {
    const x = document.createElement(tag);
    if (cls) x.className = cls;
    if (txt !== undefined && txt !== null) x.textContent = txt;
    return x;
  }

  // Show loading overlay with spinner
  function showLoadingOverlay() {
    const overlay = el("div", "cq-loading-overlay");
    const spinner = el("div", "cq-spinner");
    const text = el("div", "cq-loading-text", "Generating your career analysis...");
    
    overlay.appendChild(spinner);
    overlay.appendChild(text);
    document.body.appendChild(overlay);
    
    return overlay;
  }

  function hideLoadingOverlay(overlay) {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  // Check if user has existing data
  async function checkStatus() {
    try {
      const res = await fetch(cfg.restUrlStatus + "?_=" + Date.now(), {
        method: 'GET',
        headers: {
          'X-WP-Nonce': cfg.nonce || '',
          'Accept': 'application/json'
        },
        credentials: 'same-origin'
      });

      if (res.ok) {
        const data = await res.json();
        console.log('Dream Jobs Status:', data);
        
        if (data.ok && data.status === 'completed' && data.analysis) {
          // Go straight to results
          resultData = {
            top5: data.ranking || [],
            analysis: data.analysis,
            mbti_type: data.mbti_type
          };
          ranking = data.ranking || [];
          jobs = data.jobs || [];
          step = "results";
        } else if (data.ok && data.status === 'in_progress' && data.jobs) {
          // Resume from ranking
          jobs = data.jobs;
          ranking = data.ranking && data.ranking.length > 0 ? data.ranking : jobs;
          step = "rank";
        } else {
          // Start fresh
          step = "input";
        }
      } else {
        step = "input";
      }
    } catch (err) {
      console.error('Status check error:', err);
      step = "input";
    }

    mount();
  }

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
    updatePills();
  }

  function renderInput() {
    const wrap = el("div", "cq-wrap");
    const card = el("div", "cq-card");

    const head = el("div", "cq-header");
    head.appendChild(el("h2", "cq-title", "Step 1: Your dream jobs"));
    card.appendChild(head);

    card.appendChild(
      el("p", "cq-sub",
        "Type up to 5 jobs you'd really love to do one day. Don't overthink it – just write what excites you.")
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

    function updateCanProceed() {
      const vals = Array.from(inputsWrap.querySelectorAll("input")).map((i) => i.value.trim());
      const filled = vals.filter((v) => v !== "");
      nextBtn.disabled = filled.length < 5;
    }

    inputsWrap.addEventListener("input", updateCanProceed);
    updateCanProceed();

    nextBtn.onclick = async () => {
      const vals = Array.from(inputsWrap.querySelectorAll("input")).map((i) => i.value.trim());
      jobs = vals.filter((v) => v !== "").slice(0, 5);
      ranking = [...jobs];

      // Save progress
      try {
        nextBtn.disabled = true;
        nextBtn.textContent = "Saving...";

        await fetch(cfg.restUrlSubmit, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "X-WP-Nonce": cfg.nonce || ''
          },
          credentials: 'same-origin',
          body: JSON.stringify({
            jobs: jobs,
            ranking: ranking,
            step: 'save_input'
          }),
        });
      } catch (err) {
        console.error('Save error:', err);
      }

      step = "rank";
      mount();
    };

    wrap.appendChild(card);
    root.replaceChildren(wrap);
  }

  function renderRank() {
    const wrap = el("div", "cq-wrap");
    const card = el("div", "cq-card");

    const head = el("div", "cq-header");
    head.appendChild(el("h2", "cq-title", "Step 2: Rank your jobs"));
    card.appendChild(head);

    card.appendChild(
      el("p", "cq-sub",
        "Drag the jobs so the one you'd most love to do is at the top, and the least appealing is at the bottom.")
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

      let overlay = null;

      try {
        nextBtn.disabled = true;
        nextBtn.textContent = "Thinking…";
        
        // Show spinner overlay
        overlay = showLoadingOverlay();

        const payload = {
          jobs: jobs,
          ranking: ranking,
          step: 'generate_analysis'
        };

        const res = await fetch(cfg.restUrlSubmit, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "X-WP-Nonce": cfg.nonce || ''
          },
          credentials: 'same-origin',
          body: JSON.stringify(payload),
        });

        const raw = await res.text();
        let j = null;
        try {
          j = raw ? JSON.parse(raw) : null;
        } catch (e) {
          throw new Error("Server returned non-JSON: " + raw.slice(0, 280));
        }

        if (!res.ok || !j || j.ok !== true) {
          throw new Error((j && j.error) || `${res.status} ${res.statusText}`);
        }

        resultData = j;
        
        // Hide overlay before transitioning
        hideLoadingOverlay(overlay);
        
        step = "results";
        mount();

      } catch (err) {
        hideLoadingOverlay(overlay);
        alert("Saving / AI analysis failed: " + err.message);
        nextBtn.disabled = false;
        nextBtn.textContent = "Next: See AI feedback";
      }
    };

    wrap.appendChild(card);
    root.replaceChildren(wrap);
  }

  // Parse the analysis text into sections per job
  function parseAnalysisByJob(analysisText, jobTitles) {
    const sections = [];
    
    // Try to split the analysis by job numbers or titles
    const lines = analysisText.split('\n');
    let currentJobIndex = -1;
    let currentContent = [];
    
    for (let line of lines) {
      // Check if line starts with a job number or contains a job title
      let foundJobMatch = false;
      
      for (let i = 0; i < jobTitles.length; i++) {
        const jobTitle = jobTitles[i];
        const jobNum = i + 1;
        
        // Check for patterns like "1)", "1.", "## 1", job title in bold, etc.
        const patterns = [
          new RegExp(`^#*\\s*${jobNum}[\\)\\.]\\s*`, 'i'),
          new RegExp(`^#*\\s*${jobNum}\\s+[–-]?\\s*\\*\\*${jobTitle}`, 'i'),
          new RegExp(`^#*\\s*\\*\\*${jobTitle}\\*\\*`, 'i'),
        ];
        
        if (patterns.some(p => p.test(line))) {
          // Save previous job's content
          if (currentJobIndex >= 0 && currentContent.length > 0) {
            sections[currentJobIndex] = currentContent.join('\n').trim();
          }
          
          currentJobIndex = i;
          currentContent = [line];
          foundJobMatch = true;
          break;
        }
      }
      
      if (!foundJobMatch && currentJobIndex >= 0) {
        currentContent.push(line);
      }
    }
    
    // Save the last job's content
    if (currentJobIndex >= 0 && currentContent.length > 0) {
      sections[currentJobIndex] = currentContent.join('\n').trim();
    }
    
    // If we couldn't parse sections, return the full text for each job
    if (sections.filter(s => s).length === 0) {
      return jobTitles.map(() => analysisText);
    }
    
    return sections;
  }

  function createAccordionItem(jobTitle, rank, content, isExpanded = false) {
    const item = el("div", "cq-accordion-item");
    
    const header = el("div", "cq-accordion-header");
    const icon = el("div", "cq-accordion-icon" + (isExpanded ? " expanded" : ""), "▶");
    const title = el("div", "cq-accordion-title", jobTitle);
    const rankBadge = el("div", "cq-accordion-rank", `#${rank}`);
    
    header.appendChild(icon);
    header.appendChild(title);
    header.appendChild(rankBadge);
    
    const contentDiv = el("div", "cq-accordion-content" + (isExpanded ? " expanded" : ""));
    const body = el("div", "cq-accordion-body");
    const text = el("div", "cq-job-details", content);
    body.appendChild(text);
    contentDiv.appendChild(body);
    
    // Toggle functionality
    header.onclick = () => {
      const isCurrentlyExpanded = icon.classList.contains("expanded");
      
      if (isCurrentlyExpanded) {
        icon.classList.remove("expanded");
        contentDiv.classList.remove("expanded");
      } else {
        icon.classList.add("expanded");
        contentDiv.classList.add("expanded");
      }
    };
    
    item.appendChild(header);
    item.appendChild(contentDiv);
    
    return item;
  }

  function renderResults() {
    const wrap = el("div", "cq-wrap");
    const card = el("div", "cq-card");

    const head = el("div", "cq-header");
    head.appendChild(el("h2", "cq-title", "Your dream jobs – and what they say about you"));
    card.appendChild(head);

    const top5 = (resultData && resultData.top5) || ranking.slice(0, 5);
    const analysis = (resultData && resultData.analysis) || "";
    const mbtiType = resultData && resultData.mbti_type;

    if (top5 && top5.length) {
      card.appendChild(el("p", "cq-sub", "Here are your dream jobs in order of preference:"));
      
      const list = el("ul", "cq-list cq-list-small");
      top5.forEach((job, i) => {
        const li = el("li", "cq-item cq-item-static");
        const rank = el("span", "cq-rankpill", `#${i + 1}`);
        const label = el("span", "cq-label", job);
        li.appendChild(rank);
        li.appendChild(label);
        list.appendChild(li);
      });
      card.appendChild(list);
    }

    if (mbtiType) {
      const mbtiNote = el("p", "cq-mbti-note", 
        "Based on your MBTI personality type (" + mbtiType + "), here's how these careers align with your strengths:"
      );
      card.appendChild(mbtiNote);
    }

    // Create accordion with job details
    if (analysis && top5.length) {
      const jobSections = parseAnalysisByJob(analysis, top5);
      
      const accordion = el("div", "cq-accordion");
      
      top5.forEach((job, i) => {
        const jobContent = jobSections[i] || "Details not available.";
        const isFirstJob = i === 0;
        const accordionItem = createAccordionItem(job, i + 1, jobContent, isFirstJob);
        accordion.appendChild(accordionItem);
      });
      
      card.appendChild(accordion);
      
      // Add any remaining analysis (comparisons, next steps, etc.)
      // Look for content after all job sections
      const remainingAnalysis = analysis.split(/\n---\n|\n\nThen compare|\n\n##\s*📌/i);
      if (remainingAnalysis.length > 1) {
        const finalSection = remainingAnalysis[remainingAnalysis.length - 1].trim();
        if (finalSection) {
          const analysisBox = el("div", "cq-analysis");
          const p = el("p", "cq-analysis-text", finalSection);
          analysisBox.appendChild(p);
          card.appendChild(analysisBox);
        }
      }
    } else if (!analysis) {
      const analysisBox = el("div", "cq-analysis");
      analysisBox.appendChild(
        el("p", "cq-analysis-text",
          "We couldn't fetch AI feedback right now, but you can still use the chat below to ask questions about your jobs.")
      );
      card.appendChild(analysisBox);
    }

    if (chatSource && chatSource.firstChild) {
      const chatTitle = el("h3", "cq-chat-title", "Chat with an AI careers guide");
      const chatIntro = el("p", "cq-chat-sub",
        "Ask questions about these jobs, what skills they use day-to-day, or how you could start exploring them.");
      const chatWrap = el("div", "cq-chatwrap");

      while (chatSource.firstChild) {
        chatWrap.appendChild(chatSource.firstChild);
      }

      card.appendChild(chatTitle);
      card.appendChild(chatIntro);
      card.appendChild(chatWrap);
    }

    // No action buttons on results screen

    wrap.appendChild(card);
    root.replaceChildren(wrap);
  }

  function mount() {
    if (step === "loading") {
      root.textContent = "Loading...";
    } else if (step === "input") {
      renderInput();
    } else if (step === "rank") {
      renderRank();
    } else {
      renderResults();
    }
  }

  // Start by checking status
  checkStatus();
})();