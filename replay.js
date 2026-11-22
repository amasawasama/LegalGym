"use strict";

function mountCaseReplay(run) {
  const get = id => document.getElementById(id);
  const create = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    if (className) element.className = className;
    return element;
  };

  const names = {
    "PRJ-620": "核对融资进度",
    "QTE-112": "核对服务报价",
    "AUTH-905": "核对签署授权",
    "REG-204": "核对合同相对方",
    "REG-087": "查看近似名称主体",
  };
  const steps = [
    { title: "阅读原合同", kind: "brief" },
    ...run.browser.map(event => ({
      ...event,
      title: names[event.record] ?? (event.query ? "企业查询 · " + event.query : "打开项目资料室"),
      kind: "record",
    })),
    { title: "查看合同交付", kind: "delivery" },
  ];
  const viewButtons = document.querySelectorAll("#case-replay [data-view]");
  const stepContent = get("replay-step-content");
  const previous = get("replay-previous");
  const next = get("replay-next");
  const stepButtons = [];
  let active = 0;

  function selectView(view) {
    for (const button of viewButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.view === view));
    }
    get("replay-trace").hidden = view !== "trace";
    get("replay-contract").hidden = view !== "contract";
  }

  function contractOriginal() {
    const fragment = document.createDocumentFragment();
    for (const clause of run.contract.clauses) {
      const item = create("div", "", "replay-clause");
      item.append(create("h5", clause.heading), create("p", clause.text));
      fragment.append(item);
    }
    return fragment;
  }

  function recordSnapshot(step) {
    const fragment = document.createDocumentFragment();
    const figure = create("figure", "", "replay-record");
    const frame = create("div", "", "replay-frame");
    const image = create("img");
    image.src = "assets/replay/" + step.screenshot;
    image.alt = step.title + "的网页记录截图";
    image.width = 1120;
    image.height = 700;
    frame.append(image);
    const label = step.record ?? (step.query ? "查询词 " + step.query : "项目资料室");
    figure.append(create("figcaption", "网页记录 · " + label), frame);
    const details = create("details", "", "replay-details");
    const text = step.text.replace(/^C06-DEMO · /, "").replace(/^模拟名录仅覆盖本案快照所含事件\s*$/m, "");
    details.append(create("summary", "查看网页文字"), create("pre", text.trim()));
    fragment.append(figure, details);
    return fragment;
  }

  function documentPreview() {
    const host = create("div", "", "replay-word-preview");
    const pages = run.document?.previewPages || [];
    const link = create("a", "下载修订 Word", "button dark");
    link.href = run.document?.wordPath || "assets/c06-contract-redline.docx";
    link.download = "c06-contract-redline.docx";
    host.append(link);
    const gallery = create("div");host.append(gallery);
    new window.LegalGymWordPager(gallery).update(pages);
    return host;
  }

  function contractDelivery() {
    const fragment = document.createDocumentFragment();
    const button = create("button", "对照合同修改", "button dark");
    button.type = "button";
    button.addEventListener("click", () => {
      selectView("contract");
      document.querySelector('#case-replay [data-view="contract"]').focus();
    });
    fragment.append(create("p", "查看此次运行对服务范围、付款、驻场和签署授权四处条款的修改。"), button, documentPreview());
    return fragment;
  }

  function showStep(index) {
    active = index;
    const step = steps[index];
    stepButtons.forEach((button, position) => {
      if (position === index) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    previous.disabled = index === 0;
    next.disabled = index === steps.length - 1;
    get("replay-step-title").textContent = step.title;
    if (step.kind === "brief") stepContent.replaceChildren(contractOriginal());
    else if (step.kind === "record") stepContent.replaceChildren(recordSnapshot(step));
    else stepContent.replaceChildren(contractDelivery());
  }

  for (const [index, step] of steps.entries()) {
    const item = create("li");
    const button = create("button", "", "replay-step");
    button.type = "button";
    const number = create("span", String(index + 1).padStart(2, "0"));
    number.setAttribute("aria-hidden", "true");
    button.append(number, create("span", step.title));
    button.addEventListener("click", () => showStep(index));
    stepButtons.push(button);
    item.append(button);
    get("replay-steps").append(item);
  }

  previous.addEventListener("click", () => showStep(active - 1));
  next.addEventListener("click", () => showStep(active + 1));
  viewButtons.forEach(button => button.addEventListener("click", () => selectView(button.dataset.view)));

  const clauses = new Map(run.contract.clauses.map(clause => [clause.id, clause]));
  for (const edit of run.submission.edits) {
    const clause = clauses.get(edit.clause);
    const details = create("details", "", "replay-edit");
    details.open = edit.clause === "P02";
    details.append(create("summary", clause.heading),
      create("p", "修改前\n" + clause.text, "replay-original"),
      create("p", "修改后\n" + edit.replacement, "replay-revised"));
    const evidence = create("div", "", "replay-evidence");
    for (const record of edit.evidenceIds) {
      const index = steps.findIndex(step => step.record === record);
      if (index < 0) continue;
      const button = create("button", "查看证据 " + record);
      button.type = "button";
      button.addEventListener("click", () => {
        selectView("trace");
        showStep(index);
        stepButtons[index].focus();
      });
      evidence.append(button);
    }
    details.append(evidence);
    get("replay-edits").append(details);
  }

  get("replay-document-preview").append(documentPreview());
  get("replay-model").textContent = run.harness + " / " + run.model;
  showStep(0);
  selectView("contract");
  get("case-replay").hidden = false;
}

if (window.C06_RUN) mountCaseReplay(window.C06_RUN);
