"use strict";

const byId = id => document.getElementById(id);
const dialog = byId("join-dialog");
const message = byId("join-message");
const feedback = byId("copy-status");
const invitation = {
  legal: ["参与律师评审", "你好，我有意参与 LegalGym 的律师评审。\n\n我擅长的业务领域：\n我感兴趣的工作（提供案例、审题、评阅合同）：\n方便沟通的时间与方式："],
  partner: ["参与项目合作", "你好，我有意参与 LegalGym 的项目合作。\n\n我所在的团队：\n我希望合作的方向（业务环境、案例、评测实验）：\n方便沟通的时间与方式："],
};
document.querySelectorAll("[data-join]").forEach(button => button.addEventListener("click", () => {
  const [title, draft] = invitation[button.dataset.join];
  byId("join-title").textContent = title;
  message.value = draft;
  feedback.textContent = "";
  dialog.showModal();
}));
byId("copy-message").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(message.value);
    feedback.textContent = "已复制";
  } catch {
    message.focus();
    message.select();
    feedback.textContent = document.execCommand("copy") ? "已复制" : "内容已选中，可以手动复制";
  }
});

