<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn } from "@/lib/utils";

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(defineProps<{ modelValue?: string | number; type?: string }>(), {
  modelValue: undefined,
  type: "text",
});
const emit = defineEmits<{ "update:modelValue": [string] }>();

const attrs = useAttrs();
const forwardedAttrs = computed(() => {
  const { class: _class, ...rest } = attrs;
  return rest;
});

const classes = computed(() =>
  cn(
    "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50",
    attrs.class as string | undefined,
  ),
);

const currentValue = computed(() => {
  if (props.modelValue !== undefined) return props.modelValue;
  const legacy = (attrs as Record<string, unknown>).value;
  return (legacy as string | number | undefined) ?? "";
});

function onInput(event: Event) {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
}
</script>

<template>
  <input v-bind="forwardedAttrs" :type="props.type" :value="currentValue" :class="classes" @input="onInput" />
</template>
