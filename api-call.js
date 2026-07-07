// const axios = require("axios");
import axios from "axios";
import dotenv from "dotenv";

dotenv.config({
  quiet:true,
});

const api = axios.create({
  baseURL: process.env.API_URL,
});

export async function getCity(cityName) {
  try {
  const { data } = await api.get(process.env.ROUTE_CITY, {
    params: { 
      "name": cityName,
    },
  })
  const city = data["hydra:member"].find(c => c.name === `${cityName}`);
  const city_id = city?.id;
  console.log(city_id);
  if (city === undefined) {
    console.log("Такого міста не існує");
  }
  return city_id;
  }
  catch(err) {
  console.log(`${err} Помилка отримання міста`);
  }
}

export async function getStreet(city_id, streetName) {
try {
  const { data } = await api.get(process.env.ROUTE_STREET, {
    params: { 
      "city.id": city_id,
      "name": streetName,
    },
  });
  const street = data["hydra:member"] || []
  const street_id = street[0]?.id;
  console.log(street_id);
   if (street === undefined) {
    console.log("Такої вулиці не існує");
    console.log(street);
  }
  return street_id;
  }
  catch(err) {
    console.log(`${err} Помилка отримання вулиці`)
  }
}

export async function getBuildName(city_id, street_id, buildName) {
  try {
  const { data } = await api.get(process.env.ROUTE_BUILD, {
    params: { "cityId": city_id,
              "streetId": street_id
    },
  });
  const build = data["buildingNames"].find(c => c.buildingName === `${buildName}`);
  const build_id = build?.buildingName;
  //console.log(data["buildingNames"]);
  console.log(build_id);
  if (build === undefined) {
    console.log("Такого номеру будинку не існує");
  }
  return build_id;
  }
  catch(err) {
    console.log(`${err} Помилка отримання номеру будинку`);
  }
}

export async function getGroups(city_id, street_id, build_id) {
  try {
  const { data } = await api.get(process.env.ROUTE_GROUPS, {
    params: { "cityId": city_id,
              "streetId": street_id,
              "buildingNames": build_id
    },
  });
  const group_id = data["buildingGroups"]?.[0]?.chergGpv;
  console.log(group_id);
  if (group_id === undefined) {
    console.log("Черга не знайдена");
  }
  return group_id;
  }
  catch(err) {
    console.log(`${err} Помилка отримання номеру черги`)
  }
}

export async function generateKey(city_id, street_id, build_id) {
  try{
  const keyString = `${city_id}/${street_id}/${build_id}`;
  const timeVal = keyString.replaceAll("/", "");
  const debugKey = Buffer.from(keyString, "utf8").toString("base64");

  return { timeVal, debugKey };
  }
  catch(err) {
    console.log(`${err} Не вдалось згенерувати X-debug-key`);
  }
}

export async function getSchedule(group_id, debugKey, timeVal) {  
  try{
  const now = new Date();
  const afterDate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0
  ));
  
  const beforeDate = new Date(afterDate.getTime() + 24 * 60 * 60 * 1000);

  const toPythonLikeUtc = (d) => {
    const iso = d.toISOString();
    return iso.slice(0, 19) + "+00:00";
  };

  const after = toPythonLikeUtc(afterDate);
  const before = toPythonLikeUtc(beforeDate);
  const { data } = await api.get(process.env.ROUTE_GRAPHS, {
    params: { "before": before,
              "after": after,
              "group[]": group_id,
              "time": timeVal,
    },
    headers: {
    "X-debug-key": debugKey,
    "Accept": "application/json",
  },
  });

  const graph = data["hydra:member"] || [];
  const graphRow = graph.map(({ id, dateGraph, dataJson }) => ({
    id, dateGraph, dataJson
  }))
  //console.dir(graphRow, { depth: null });
  if (graph === undefined) {
    console.log("Графік відключення не знайдено");
  }
  return graphRow;
}
catch(err) {
  console.log(`${err} Помилка отримання графіка відключень`);
  }
}

// export async function compressTime(schedule) {
//   try {
//   const schConv = Object.entries(schedule);
//   if(schConv.length === 0) return [];
//
//   const out = [];
//   let startTime = schConv[0][0];
//   let prevTime = schConv[0][0];
//   let prevVal = schConv[0][1];
//
//
//   for(let i = 1; i < schConv.length; i++) {
//     let [time,val] = schConv[i];
//
//     if(val !== prevVal) {      
//       out.push({
//         from: startTime,
//         to: time,
//         value: prevVal,
//       }); 
//       startTime = time;
//       prevVal = val;
//     }
//       prevTime = time;
//   }
//
//     out.push({
//     from: startTime,
//     to: prevTime,
//     value: prevVal,
//   })
//
//   for (const item of out) {
//     switch (item.value) {
//       case "1":
//         item.value = "🔴";
//         break;
//       case "0":
//         item.value = "🟢";
//       default:
//         break;
//     }
//     if(item.value === "10") {
//       item.value = "🟡";
//     }
//   }
//
//   return out;
//   }
//   catch(err) {
//     console.log(`${err} Помилка перетворення графіка`);
//   }
// }

export async function compressTime(schedule) {
  try {
    const schConv = Object.entries(schedule);
    if (schConv.length === 0) return [];

    const out = [];
    let startTime = schConv[0][0];
    let prevVal = schConv[0][1];

    for (let i = 1; i < schConv.length; i++) {
      const [time, val] = schConv[i];

      if (val !== prevVal) {
        out.push({
          from: startTime,
          to: time,
          value: prevVal,
        });

        startTime = time;
        prevVal = val;
      }
    }

    const lastTime = schConv[schConv.length - 1][0];

    out.push({
      from: startTime,
      to: lastTime,
      value: prevVal,
    });

    for (const item of out) {
      switch (item.value) {
        case "1":
          item.value = "🔴";
          break;
        case "0":
          item.value = "🟢";
          break;
        case "10":
          item.value = "🟡";
          break;
        default:
          break;
      }
    }

    return out.filter(item => item.from !== item.to);
  } catch (err) {
    console.log(`${err} Помилка перетворення графіка`);
    return [];
  }
}

export async function formatDate(dateString) {
  try {
  const date = new Date(dateString);
  
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  
  return `${day}.${month}.${year}`;
  }
  catch(err) {
    console.log(`${err} Не вдалось форматувати дату`)
  }
}

function getCurrentTime() {
  const now = new Date();
  return (
    String(now.getHours()).padStart(2, "0") +
    ":" +
    String(now.getMinutes()).padStart(2, "0")
  );
}

function isTimeInInterval(currentTime, from, to) {
  if (from < to) {
    return currentTime >= from && currentTime < to;
  }

  return currentTime >= from || currentTime < to;
}

export async function getCurrentInterval(intervals) {
  const currentTime = getCurrentTime();
  return intervals.find(item =>
    isTimeInInterval(currentTime, item.from, item.to)
  ) || null;
}

export async function getNextInterval(intervals) {
  const currentTime = getCurrentTime();

  const currentIndex = intervals.findIndex(item =>
    isTimeInInterval(currentTime, item.from, item.to)
  );

  if (currentIndex !== -1) {
    return intervals[currentIndex + 1] || intervals[0] || null;
  }

  return intervals.find(item => item.from > currentTime) || intervals[0] || null;
}
