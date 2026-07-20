"use strict";

(function initializeNightfallConfig() {
    const WORLD = { width: 1440, height: 960 };
    const VILLAGE = { x: 720, y: 480, radius: 94 };
    const HOUSES = [
      {
        id: "workshop",
        x: VILLAGE.x - 48,
        footY: VILLAGE.y - 13,
        variant: 0,
        sign: "UPGRADES",
        menu: "upgradeMenu"
      },
      {
        id: "storage",
        x: VILLAGE.x + 42,
        footY: VILLAGE.y - 25,
        variant: 1,
        sign: "STORAGE",
        menu: "storageMenu"
      },
      {
        id: "village-hall",
        x: VILLAGE.x + 47,
        footY: VILLAGE.y + 53,
        variant: 2,
        sign: "VILLAGE",
        menu: "villageMenu"
      },
      {
        id: "future-west",
        x: VILLAGE.x - 50,
        footY: VILLAGE.y + 51,
        variant: 3,
        sign: ""
      }
    ];
    const DAY_LENGTH = 45;
    const NIGHT_LENGTH = 18;
    const SAVE_KEY = "nightfall-village-save-v1";
    const REDUCE_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resourceDefs = {
      wood: { color: "#71945a", label: "young tree", radius: 9, weight: 0.46 },
      stone: { color: "#92968b", label: "mossy stone", radius: 8, weight: 0.32 },
      crystal: { color: "#82c8bd", label: "moon crystal", radius: 7, weight: 0.12 },
      hide: { color: "#b8835d", label: "wild hare", radius: 7, weight: 0.10 }
    };

    const upgradeDefs = [
      {
        id: "boots",
        glyph: "»",
        name: "Trail Boots",
        description: "+10% wandering speed",
        max: 6,
        cost: function(level) { return { wood: 6 + level * 5, stone: level * 2 }; }
      },
      {
        id: "bag",
        glyph: "▣",
        name: "Larger Pack",
        description: "+4 carrying capacity",
        max: 6,
        cost: function(level) { return { wood: 8 + level * 5, stone: 4 + level * 3 }; }
      },
      {
        id: "tools",
        glyph: "⌁",
        name: "Steel Tools",
        description: "+1 resource each gather",
        max: 4,
        cost: function(level) { return { wood: 7 + level * 5, stone: 8 + level * 6 }; }
      },
      {
        id: "weapon",
        glyph: "†",
        name: "Hunter Weapon",
        description: "+8 swing damage",
        max: 7,
        cost: function(level) { return { stone: 10 + level * 7, crystal: level * 2 }; }
      },
      {
        id: "armor",
        glyph: "◇",
        name: "Night Armor",
        description: "+20 HP and damage reduction",
        max: 6,
        cost: function(level) { return { wood: 6 + level * 4, stone: 12 + level * 7, crystal: level }; }
      }
    ];

    const villageUpgradeDefs = [
      {
        id: "villagers",
        glyph: "♟",
        name: "Hire Gatherer",
        description: "+1 villager who walks into the woods and brings back resources",
        max: 4,
        cost: function(level) { return { wood: 24 + level * 18, stone: 10 + level * 8, hide: 2 + level * 2 }; }
      },
      {
        id: "workers",
        glyph: "↟",
        name: "Gatherer Training",
        description: "Villagers walk faster and return to work sooner",
        max: 5,
        requiresGatherer: true,
        cost: function(level) { return { wood: 16 + level * 12, stone: 8 + level * 7, crystal: level * 2 }; }
      },
      {
        id: "center",
        glyph: "⌂",
        name: "Village Center",
        description: "Expands the safe village circle and central square",
        max: 5,
        cost: function(level) { return { wood: 30 + level * 22, stone: 20 + level * 14, crystal: 2 + level * 2 }; }
      },
      {
        id: "streets",
        glyph: "≡",
        name: "Growing Streets",
        description: "+8% movement speed while travelling on village streets",
        max: 5,
        cost: function(level) { return { wood: 22 + level * 18, stone: 18 + level * 12, hide: level }; }
      }
    ];

window.NightfallConfig = {
  WORLD,
  VILLAGE,
  HOUSES,
  DAY_LENGTH,
  NIGHT_LENGTH,
  SAVE_KEY,
  REDUCE_MOTION,
  resourceDefs,
  upgradeDefs,
  villageUpgradeDefs
};
})();
