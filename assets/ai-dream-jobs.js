(function () {
  const cfg = window.AI_DREAM_JOBS_CFG || {};
  const root = document.getElementById("ai-dream-jobs-root");
  if (!root) return;

  console.log('AI Dream Jobs Config:', cfg);

  const chatSource = document.getElementById("ai-dream-jobs-chat-source");

  let jobs = [];
  let ranking = [];
  let resultData = null;
  let step = "loading";

  function el(tag, cls, txt) {
    const x = document.createElement(tag);
    if (cls) x.className = cls;
    if (txt !== undefined && txt !== null) x.textContent = txt;
    return x;
  }

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

  async function checkStatus() {
    try {
      console.log('Checking status at:', cfg.restUrlStatus);
      
      const res = await fetch(cfg.restUrlStatus + "?_=" + Date.now(), {
        method: 'GET',
        headers: {
          'X-WP-Nonce': cfg.nonce || '',
          'Accept': 'application/json'
        },
        credentials: 'same-origin'
      });

      console.log('Status response:', res.status, res.statusText);

      if (res.ok) {
        const data = await res.json();
        console.log('Dream Jobs Status:', data);
        
        if (data.ok && data.status === 'completed' && data.analysis) {
          resultData = {
            top5: data.ranking || [],
            analysis: data.analysis,
            mbti_type: data.mbti_type
          };
          ranking = data.ranking || [];
          jobs = data.jobs || [];
          step = "results";
        } else if (data.ok && data.status === 'in_progress' && data.jobs) {
          jobs = data.jobs;
          ranking = data.ranking && data.ranking.length > 0 ? data.ranking : jobs;
          step = "rank";
        } else {
          step = "input";
        }
      } else {
        const errorText = await res.text();
        console.error('Status check failed:', res.status, errorText);
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

      try {
        nextBtn.disabled = true;
        nextBtn.textContent = "Saving...";

        console.log('Saving jobs:', jobs);

        const res = await fetch(cfg.restUrlSubmit, {
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

        const data = await res.json();
        console.log('Save response:', data);

        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Save failed');
        }

      } catch (err) {
        console.error('Save error:', err);
        alert('Failed to save: ' + err.message);
        nextBtn.disabled = false;
        nextBtn.textContent = "Next: Rank my jobs";
        return;
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
    backBtn.onclick = async () => {
      try {
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
            step: 'back_to_input'
          }),
        });
      } catch (err) {
        console.error('Back error:', err);
      }
      
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
        
        overlay = showLoadingOverlay();

        const payload = {
          jobs: jobs,
          ranking: ranking,
          step: 'generate_analysis'
        };

        console.log('Generating analysis:', payload);

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
        console.log('Analysis response (raw):', raw.substring(0, 500));
        
        let j = null;
        try {
          j = raw ? JSON.parse(raw) : null;
        } catch (e) {
          throw new Error("Server returned non-JSON: " + raw.slice(0, 280));
        }

        console.log('Analysis response (parsed):', j);

        if (!res.ok || !j || j.ok !== true) {
          throw new Error((j && j.error) || `${res.status} ${res.statusText}`);
        }

        resultData = j;
        
        hideLoadingOverlay(overlay);
        
        step = "results";
        mount();

      } catch (err) {
        hideLoadingOverlay(overlay);
        console.error('Analysis error:', err);
        alert("Saving / AI analysis failed: " + err.message);
        nextBtn.disabled = false;
        nextBtn.textContent = "Next: See AI feedback";
      }
    };

    wrap.appendChild(card);
    root.replaceChildren(wrap);
  }

  function renderResults() {
    const wrap = el("div", "cq-wrap");
    const card = el("div", "cq-card");

    const head = el("div", "cq-header");
    head.appendChild(el("h2", "cq-title", "Your Career Analysis"));
    card.appendChild(head);

    const top5 = (resultData && resultData.top5) || ranking.slice(0, 5);
    const analysis = (resultData && resultData.analysis) || "";
    const mbtiType = resultData && resultData.mbti_type;

    if (mbtiType) {
      const mbtiNote = el("p", "cq-mbti-note", 
        "Based on your MBTI personality type (" + mbtiType + "), here's your personalized career guidance:"
      );
      card.appendChild(mbtiNote);
    }

    if (analysis) {
      const analysisBox = el("div", "cq-analysis");
      const analysisText = el("div", "cq-analysis-text");
      analysisText.textContent = analysis;
      analysisBox.appendChild(analysisText);
      card.appendChild(analysisBox);
    } else {
      const analysisBox = el("div", "cq-analysis");
      analysisBox.appendChild(
        el("p", "cq-analysis-text",
          "We couldn't fetch AI feedback right now, but you can still use the chat below to ask questions about your jobs.")
      );
      card.appendChild(analysisBox);
    }

    // Add custom AI careers chat
    const chatTitle = el("h3", "cq-chat-title", "Chat with an AI careers guide");
    const chatIntro = el("p", "cq-chat-sub",
      "Ask questions about your dream jobs, what skills they use day-to-day, or how you could start exploring them.");
    const chatWrap = el("div", "cq-chatwrap");
    
    // Chat history container
    const chatHistory = el("div", "cq-chat-history");
    chatHistory.style.cssText = "max-height: 400px; overflow-y: auto; margin-bottom: 12px; padding: 10px; background: #f5f5f5; border-radius: 6px;";
    
    // Initial AI message
    const initialMsg = el("div", "cq-chat-msg ai-msg");
    initialMsg.style.cssText = "margin-bottom: 10px; padding: 8px 12px; background: #e3f2fd; border-radius: 8px; border-left: 3px solid #2196f3;";
    initialMsg.textContent = "Hi! I'm here to help you explore your dream jobs. What would you like to know?";
    chatHistory.appendChild(initialMsg);
    
    chatWrap.appendChild(chatHistory);
    
    // Input container
    const inputContainer = el("div");
    inputContainer.style.cssText = "display: flex; gap: 8px; align-items: center;";
    
    const chatInput = document.createElement("input");
    chatInput.type = "text";
    chatInput.placeholder = "Ask about skills, qualifications, salaries...";
    chatInput.style.cssText = "flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;";
    
    const sendBtn = el("button", "cq-btn", "Send");
    sendBtn.style.cssText = "padding: 10px 20px; white-space: nowrap;";
    
    // Send message function
    const sendMessage = async () => {
      const userMsg = chatInput.value.trim();
      if (!userMsg) return;
      
      // Add user message to history
      const userMsgEl = el("div", "cq-chat-msg user-msg");
      userMsgEl.style.cssText = "margin-bottom: 10px; padding: 8px 12px; background: #fff; border-radius: 8px; border-left: 3px solid #666; text-align: right;";
      userMsgEl.textContent = userMsg;
      chatHistory.appendChild(userMsgEl);
      
      // Clear input and disable send button
      chatInput.value = "";
      sendBtn.disabled = true;
      sendBtn.textContent = "Thinking...";
      
      // Scroll to bottom
      chatHistory.scrollTop = chatHistory.scrollHeight;
      
      try {
        const response = await fetch(cfg.restUrlCareerChat, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-WP-Nonce': cfg.nonce || ''
          },
          credentials: 'same-origin',
          body: JSON.stringify({
            message: userMsg
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.ok && data.response) {
            const aiMsgEl = el("div", "cq-chat-msg ai-msg");
            aiMsgEl.style.cssText = "margin-bottom: 10px; padding: 8px 12px; background: #e3f2fd; border-radius: 8px; border-left: 3px solid #2196f3;";
            aiMsgEl.textContent = data.response;
            chatHistory.appendChild(aiMsgEl);
            chatHistory.scrollTop = chatHistory.scrollHeight;
          }
        } else {
          throw new Error('Failed to get response');
        }
      } catch (err) {
        console.error('Chat error:', err);
        const errorMsgEl = el("div", "cq-chat-msg error-msg");
        errorMsgEl.style.cssText = "margin-bottom: 10px; padding: 8px 12px; background: #ffebee; border-radius: 8px; border-left: 3px solid #f44336;";
        errorMsgEl.textContent = "Sorry, I couldn't process your message. Please try again.";
        chatHistory.appendChild(errorMsgEl);
      } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = "Send";
        chatInput.focus();
      }
    };
    
    // Event listeners
    sendBtn.onclick = sendMessage;
    chatInput.onkeypress = (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    };
    
    inputContainer.appendChild(chatInput);
    inputContainer.appendChild(sendBtn);
    chatWrap.appendChild(inputContainer);
    
    card.appendChild(chatTitle);
    card.appendChild(chatIntro);
    card.appendChild(chatWrap);

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

  checkStatus();
})();