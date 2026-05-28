---
title: Tech Layoffs 2020–2025
---

```js
import { layoffHeatmap } from "./components/layoffHeatmap.js";
```

```js
const data = FileAttachment("./data/Cleaned_tech_layoffs.csv").csv({typed: true});
```

```js
layoffHeatmap(data, {width: 900})
```
