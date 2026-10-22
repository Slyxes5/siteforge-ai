/** Host-owned illustration slots. The model never supplies an arbitrary asset URL. */
export const coffeeArt = {
  hero: "/graphics/coffee-hero.svg",
  menu: [
    "/graphics/coffee-cup.svg",
    "/graphics/coffee-glass.svg",
    "/graphics/coffee-pastry.svg",
  ],
  gallery: [
    "/graphics/coffee-room.svg",
    "/graphics/coffee-counter.svg",
    "/graphics/coffee-detail.svg",
  ],
} as const;
export const generationImageSources = [
  "/sample-landscape.svg",
  coffeeArt.hero,
  ...coffeeArt.menu,
  ...coffeeArt.gallery,
] as const;
export function menuIllustration(title: string) {
  if (/croissant|roti|pastry|cake|kue|toast/i.test(title))
    return coffeeArt.menu[2];
  if (/iced|susu|matcha|dingin|latte/i.test(title)) return coffeeArt.menu[1];
  return coffeeArt.menu[0];
}
