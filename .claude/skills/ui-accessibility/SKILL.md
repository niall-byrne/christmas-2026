---
name: ui-accessibility
description: Enforces global UI requirements, high-visibility text scaling (eye icon toggle), localStorage persistence, and WCAG AAA high-contrast standards across all UI components and layouts.
---

# Global UI Accessibility Skill

## Purpose

Enforces accessibility standards automatically during UI code generation, ensuring an inclusive experience for all users, including low-vision family members.

## Core Enforcement Rules

1. **High-Visibility Text Scaling ("Large Text Mode"):**
   - Must include a persistent global toggle featuring an eye icon in the navigation or header.
   - Must apply scaling classes (e.g., `accessibility-large`) directly to the root document container.
   - Must synchronize and persist preferences via `localStorage` across page reloads.

2. **High-Contrast Color Standards:**
   - All text and interactive controls must adhere to WCAG AAA contrast ratios against their background containers.
   - Avoid low-contrast muted tones for critical indicators (such as ready vs. unready status badges or countdown timers).
   - Provide distinct visual indicators beyond color alone (e.g., explicit text labels, borders, or iconography).
