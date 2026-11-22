"use strict";

const records = {
  "REG-204": {
    kind: "企业名录", title: "栖原园区建设有限公司",
    details: [
      ["主体识别码", "MOCK-ORG-0204"],
      ["登记状态", "存续"],
      ["登记地", "临汀市 · 新港区"],
      ["登记法定代表人", "冉秋岚"],
      ["风险记录", "近 12 个月有 1 条已结案合同纠纷，快照未列当前被执行记录"],
      ["历史记录范围", "本案名录仅覆盖资料快照所含事件"],
    ],
  },
  "REG-087": {
    kind: "企业名录", title: "栖原园区建设服务有限公司",
    details: [["主体识别码", "MOCK-ORG-0087"], ["登记地", "临汀市 · 鹤洲区"], ["登记状态", "存续"]],
  },
  "PRJ-620": {
    kind: "融资台账", title: "临汀智造园二期 · 融资进度",
    details: [
      ["项目主体", "栖原园区建设有限公司 · MOCK-ORG-0204"],
      ["融资状态", "银行已收件，仍在审查"],
      ["系统附件", "未上传授信批复或放款凭证"],
      ["预计用款", "内部预计 2027 年第一季度，通知未获银行确认"],
    ],
  },
  "QTE-112": {
    kind: "报价存档", title: "澄页工程咨询 · 二期服务报价",
    details: [
      ["报价状态", "客户内部报价基线，尚未经双方确认"],
      ["含税总价", "人民币 280 万元"],
      ["项目启动与设计", "项目经理按评审节点到场，采购咨询按会议到场"],
      ["施工阶段", "2 名造价工程师工作日驻场"],
      ["增项范围", "夜间随班、长期增派及一期争议事项复核均未纳入报价"],
    ],
  },
  "AUTH-905": {
    kind: "授权登记", title: "二期项目 · 签署和变更授权",
    details: [
      ["项目对接", "周组长，接收工作文件并确认日常工作记录"],
      ["签署授权", "资料室未登记周组长的签署授权委托书"],
      ["商业变更", "原登记仅为日常对接，价格、付款条件、增项须另核授权"],
    ],
  },
};

const main = document.querySelector("main");
const params = new URLSearchParams(location.search);
const record = params.get("record");
const term = params.get("q");

function make(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function list(ids) {
  const container = make("div", "", "list");
  for (const id of ids) {
    const item = records[id];
    const link = make("a", item.title, "record");
    link.href = "?record=" + id;
    link.dataset.record = id;
    link.append(make("span", item.kind + " · " + id));
    container.append(link);
  }
  return container;
}

function search() {
  const form = document.createElement("form");
  const field = document.createElement("input");
  field.name = "q";
  field.setAttribute("aria-label", "企业名称");
  field.placeholder = "输入企业名称";
  field.value = term ?? "";
  field.required = true;
  form.append(field, make("button", "查询"));
  return form;
}

if (record && Object.hasOwn(records, record)) {
  const item = records[record];
  const back = make("a", "返回资料室", "back");
  back.href = "./";
  const detail = make("section", "", "detail");
  detail.id = "record-detail";
  const fields = document.createElement("dl");
  for (const [label, value] of item.details) {
    const row = document.createElement("div");
    row.append(make("dt", label), make("dd", value));
    fields.append(row);
  }
  detail.append(fields);
  main.append(back, make("p", item.kind + " · " + record, "caption"), make("h1", item.title), detail);
} else if (term !== null) {
  const normalized = term.replace(/有限公司$/, "").trim();
  const matches = Object.keys(records).filter(id => id.startsWith("REG") && records[id].title.includes(normalized));
  main.append(make("h1", "企业查询结果"), search(), make("p", "查询「" + term + "」 · " + matches.length + " 个匹配主体", "hint"), list(matches));
} else {
  main.append(make("p", "业务资料快照", "caption"), make("h1", "临汀智造园二期"),
    make("p", "本案例的企业名录、项目进展、报价和授权记录。", "hint"),
    search(), make("h2", "项目记录"), list(["PRJ-620", "QTE-112", "AUTH-905"]),
    make("h2", "关联企业"), list(["REG-204", "REG-087"]));
}

