import { createApp } from "vue";
import App from "./App.vue";
import "./styles.css";

const app = createApp(App);
app.config.errorHandler = (err) => {
  const box = document.getElementById("app-error");
  if (box) {
    box.textContent = `渲染错误：${(err as Error)?.message ?? String(err)}`;
    box.className = "m-4 rounded-md border border-destructive bg-card p-3 text-sm text-destructive";
  }
  console.error(err);
};
app.mount("#app");
