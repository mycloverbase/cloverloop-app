export const PRODUCT_SUBCATEGORIES: Record<string, readonly string[]> = {
  "Education & Learning": ["Courses", "Study Notes", "eBooks", "Worksheets", "Tutorials", "Learning Resources"],
  Music: ["Tabs", "Backing Tracks", "Presets", "MIDI Files", "Sheet Music", "eBooks", "Audio Lessons"],
  "Business & Finance": ["Business Templates", "Financial Models", "Spreadsheets", "Reports", "eBooks", "Guides"],
  "Design & Creativity": ["Templates", "Graphics", "Fonts", "Presets", "Design Assets", "eBooks"],
  Marketing: ["Social Media Templates", "Content Calendars", "Marketing Guides", "Copywriting Templates", "eBooks"],
  Technology: ["Source Code", "Software", "Plugins", "Developer Tools", "Technical Guides", "eBooks"],
  Productivity: ["Notion Templates", "Excel Templates", "Planners", "Checklists", "Productivity Guides"],
  Lifestyle: ["Guides", "Recipes", "Travel Resources", "Planners", "eBooks"],
  "Health & Fitness": ["Workout Plans", "Meal Plans", "Fitness Guides", "Trackers", "eBooks"],
  Other: ["Guides", "Templates", "eBooks", "Digital Downloads"],
};

export const PRODUCT_CATEGORIES = Object.keys(PRODUCT_SUBCATEGORIES);

export const PRODUCT_CATEGORY_FALLBACKS: Record<string, string> = {
  "Education & Learning": "Learning Resources",
  Music: "Audio Lessons",
  "Business & Finance": "Guides",
  "Design & Creativity": "Design Assets",
  Marketing: "Marketing Guides",
  Technology: "Technical Guides",
  Productivity: "Planners",
  Lifestyle: "Guides",
  "Health & Fitness": "Fitness Guides",
  Other: "Digital Downloads",
};
