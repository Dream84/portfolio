<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn } from "@/lib/utils";

defineOptions({
  inheritAttrs: false,
});

const props = defineProps<{ modelValue?: string }>();
const emit = defineEmits<{ "update:modelValue": [string] }>();

const attrs = useAttrs();
const forwardedAttrs = computed(() => {
  const { class: _class, ...rest } = attrs;
  return rest;
});

const classes = computed(() =>
  cn(
    "flex h-8 w-[150px] rounded-md border border-input bg-card px-2 py-1 text-xs text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50",
    attrs.class as string | undefined,
  ),
);
</script>

<template>
  <input
    type="date"
    :value="props.modelValue"
    v-bind="forwardedAttrs"
    :class="classes"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>
