<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn } from "@/lib/utils";

defineOptions({
  inheritAttrs: false,
});

const attrs = useAttrs();
const forwardedAttrs = computed(() => {
  const { class: _class, ...rest } = attrs;
  return rest;
});

const classes = computed(() =>
  cn("rounded-lg border border-border bg-card text-card-foreground", attrs.class as string | undefined),
);
</script>

<template>
  <section v-bind="forwardedAttrs" :class="classes">
    <slot />
  </section>
</template>
