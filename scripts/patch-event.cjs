'use strict';
const fs = require('fs');

// 1. public/activated-event-rules.js
let aer = fs.readFileSync('public/activated-event-rules.js', 'utf8');
if (!aer.includes('necroticMist')) {
    aer = aer.replace(
        "chainLightning:'Chain lightning'",
        "chainLightning:'Chain lightning', necroticMist:'Necrotic mist'"
    );
    aer = aer.replace(
        "chainLightning:{ damage:10, damageType:'magic', radius:2, count:4, side:'all', delay:0 }\r\n    };",
        "chainLightning:{ damage:10, damageType:'magic', radius:2, count:4, side:'all', delay:0 },\r\n        necroticMist:{ radius:2, duration:3, damage:8, damageType:'magic', side:'heroes' }\r\n    };"
    );
    if (!aer.includes('necroticMist:{')) {
        // try without \r
        aer = aer.replace(
            "chainLightning:{ damage:10, damageType:'magic', radius:2, count:4, side:'all', delay:0 }\n    };",
            "chainLightning:{ damage:10, damageType:'magic', radius:2, count:4, side:'all', delay:0 },\n        necroticMist:{ radius:2, duration:3, damage:8, damageType:'magic', side:'heroes' }\n    };"
        );
    }
    aer = aer.replace(
        "['goldenGoblin','sandstorm','goblinTower','ritualTotem'].includes(input.kind)",
        "['goldenGoblin','sandstorm','goblinTower','ritualTotem','necroticMist'].includes(input.kind)"
    );
    aer = aer.replace(
        "if (['goldenGoblin','sandstorm','goblinTower','ritualTotem'].includes(c.kind)) cell(c.x,c.y);",
        "if (['goldenGoblin','sandstorm','goblinTower','ritualTotem','necroticMist'].includes(c.kind)) cell(c.x,c.y);"
    );
    fs.writeFileSync('public/activated-event-rules.js', aer, 'utf8');
    console.log('public/activated-event-rules.js updated');
}

// 2. activated-events.js
let ae = fs.readFileSync('activated-events.js', 'utf8');
if (!ae.includes('necroticMist')) {
    ae = ae.replace(
        "if(event.kind === 'sandstorm') hit(rules.targets(state(),c),c);",
        "if(event.kind === 'sandstorm' || event.kind === 'necroticMist') hit(rules.targets(state(),c),c);"
    );
    fs.writeFileSync('activated-events.js', ae, 'utf8');
    console.log('activated-events.js updated');
}

// 3. public/master-activated-events.js
let mae = fs.readFileSync('public/master-activated-events.js', 'utf8');
if (!mae.includes('necroticMist')) {
    mae = mae.replace(
        "chainLightning:'Chain lightning'",
        "chainLightning:'Chain lightning', necroticMist:'Necrotic mist'"
    );
    mae = mae.replace(
        "['frost','sandstorm','goldenGoblin','goblinTower','ritualTotem'].includes(draft.kind)",
        "['frost','sandstorm','goldenGoblin','goblinTower','ritualTotem','necroticMist'].includes(draft.kind)"
    );
    mae = mae.replace(
        "['frost','sandstorm','bombardment','banner'].includes(draft.kind)",
        "['frost','sandstorm','bombardment','banner','necroticMist'].includes(draft.kind)"
    );
    mae = mae.replace(
        "['frost','sandstorm','goldenGoblin','banner'].includes(draft.kind)",
        "['frost','sandstorm','goldenGoblin','banner','necroticMist'].includes(draft.kind)"
    );
    mae = mae.replace(
        "['frost','sandstorm','bombardment','chainLightning'].includes(draft.kind)",
        "['frost','sandstorm','bombardment','chainLightning','necroticMist'].includes(draft.kind)"
    );
    mae = mae.replace(
        "else if(config.kind==='sandstorm')summary.textContent=tr('Affected targets')+': '+ACTIVATED_EVENT_RULES.targets(state,config).length;",
        "else if(config.kind==='sandstorm' || config.kind==='necroticMist')summary.textContent=tr('Affected targets')+': '+ACTIVATED_EVENT_RULES.targets(state,config).length;"
    );
    fs.writeFileSync('public/master-activated-events.js', mae, 'utf8');
    console.log('public/master-activated-events.js updated');
}

// 4. public/activated-event-overlays.js
let aeo = fs.readFileSync('public/activated-event-overlays.js', 'utf8');
if (!aeo.includes('necroticMist')) {
    aeo = aeo.replace(
        "frost:'❄'",
        "frost:'❄',necroticMist:'☠️'"
    );
    aeo = aeo.replace(
        "else if(kind==='sandstorm')cell.classList.add('event-zone-storm');",
        "else if(kind==='sandstorm' || kind==='necroticMist')cell.classList.add('event-zone-storm');"
    );
    fs.writeFileSync('public/activated-event-overlays.js', aeo, 'utf8');
    console.log('public/activated-event-overlays.js updated');
}
