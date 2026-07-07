const axios = require("axios");

require("dotenv").config({
  quiet:true,
});

const api = axios.create({
  baseURL: process.env.API_URL,
});

async function getCity(cityName) {
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

async function getStreet(city_id, streetName) {
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

async function getBuildName(city_id, street_id, buildName) {
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

async function getGroups(city_id, street_id, build_id) {
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

async function generateKey(city_id, street_id, build_id) {
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

async function getSchedule(group_id, debugKey, timeVal) {  
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

async function compressTime(schedule) {
  try {
  const schConv = Object.entries(schedule);
  if(schConv.length === 0) return [];

  const out = [];
  let startTime = schConv[0][0];
  let prevTime = schConv[0][0];
  let prevVal = schConv[0][1];
  
  
  for(let i = 1; i < schConv.length; i++) {
    let [time,val] = schConv[i];
    
    if(val !== prevVal) {      
      out.push({
        from: startTime,
        to: time,
        value: prevVal,
      }); 
      startTime = time;
      prevVal = val;
    }
      prevTime = time;
  }


  // for(let i = 1; i < schConv.length; i++) {
  //   let [time,val] = schConv[i];
  //
  //   if(val !== prevVal) {      
  //     out.push({
  //       from: startTime,
  //       to: prevTime,
  //       value: prevVal,
  //     });
  //     startTime = time;
  //     prevVal = val;
  //   }
  //   prevTime = time;
  // }
  out.push({
    from: startTime,
    to: prevTime,
    value: prevVal,
  })
  
  for (const item of out) {
    switch (item.value) {
      case "1":
        item.value = "🔴";
        break;
      case "0":
        item.value = "🟢";
      default:
        break;
    }
    if(item.value === "10") {
      item.value = "🟡";
    }
  }

  return out;
  }
  catch(err) {
    console.log(`${err} Помилка перетворення графіка`);
  }
}
  
async function formatDate(dateString) {
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

async function getCurrentInterval(intervals) {
 const now = new Date();
 const currentTime =
 String(now.getHours()).padStart(2, "0") + ":" +
 String(now.getMinutes()).padStart(2, "0");
 return intervals.find(item => currentTime >= item.from && currentTime < item.to);
}

async function getNextInterval(intervals) {
  const now = new Date();
  const currentTime =
    String(now.getHours()).padStart(2, "0") + ":" +
    String(now.getMinutes()).padStart(2, "0");

  const currentIndex = intervals.findIndex(
    item => currentTime >= item.from && currentTime < item.to
  );

  if (currentIndex !== -1) {
    return intervals[currentIndex + 1] || null;
  }

  return intervals.find(item => item.from > currentTime) || null;
}

async function getStreet2(city_id, streetName) {
try {
  const { data } = await api.get(process.env.ROUTE_STREET, {
    params: { 
      "city.id": city_id,
      "name": streetName,
    },
  });
  const street = data["hydra:member"] || [];
  const street_id = street?.id;
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
// schedule = [
//   {
//       "@id": "/api/actual_gpv_graphs/9",
//       "@type": "ActualGpvGraph",
//       "id": 9,
//       "dateCreate": "2026-02-03T11:39:08Z",
//       "dateGraph": "2026-02-03T00:00:00Z",
//       "dataJson": {
//         "1.2": {
//           "times": {
//             "00:00": "0",
//             "00:30": "0",
//             "01:00": "0",
//             "01:30": "0",
//             "02:00": "0",
//             "02:30": "0",
//             "03:00": "0",
//             "03:30": "0",
//             "04:00": "0",
//             "04:30": "0",
//             "05:00": "0",
//             "05:30": "0",
//             "06:00": "0",
//             "06:30": "0",
//             "07:00": "0",
//             "07:30": "0",
//             "08:00": "0",
//             "08:30": "0",
//             "09:00": "10",
//             "09:30": "1",
//             "10:00": "1",
//             "10:30": "1",
//             "11:00": "1",
//             "11:30": "1",
//             "12:00": "10",
//             "12:30": "0",
//             "13:00": "0",
//             "13:30": "0",
//             "14:00": "0",
//             "14:30": "0",
//             "15:00": "0",
//             "15:30": "0",
//             "16:00": "0",
//             "16:30": "0",
//             "17:00": "0",
//             "17:30": "0",
//             "18:00": "10",
//             "18:30": "1",
//             "19:00": "1",
//             "19:30": "1",
//             "20:00": "1",
//             "20:30": "1",
//             "21:00": "1",
//             "21:30": "1",
//             "22:00": "1",
//             "22:30": "10",
//             "23:00": "0",
//             "23:30": "0"
//           }
//         }
//       }
//     }
// ]
async function main() {
  let cityName = "Тернопіль";
  let streetName = "Винниченка";
  let buildName = "7";
 const city_id = await getCity(cityName);
 const street_id = await getStreet(city_id, streetName);
 const build_id = await getBuildName(city_id, street_id, buildName);
 const group_id = await getGroups(city_id, street_id, build_id);
 const { timeVal, debugKey } = await generateKey(city_id, street_id, build_id);
  let schedule = (await getSchedule(group_id, debugKey, timeVal));
  let currentInterval
  let nextInterval 
  for (const item of schedule) {
  const times = item.dataJson?.[`${group_id}`]?.times || {};
  const timeCompress = await compressTime(times);
  const timeRow = timeCompress.map(g =>
  g.from === g.to ? `${g.from} : ${g.value}` : `${g.from} - ${g.to} : ${g.value}`
);
  currentInterval = await getCurrentInterval(timeCompress);
  nextInterval = await getNextInterval(timeCompress);
  const formDate = formatDate(item.dateGraph);
  console.log(formDate);
  console.log(timeRow.join("\n"));
  }
  if (currentInterval) {
      console.log(
        `Зараз діє: ${currentInterval.from} - ${currentInterval.to} : ${currentInterval.value}`
      );
    };
 
  if (nextInterval) {
      console.log(
        `Наступний: ${nextInterval.from} - ${nextInterval.to} : ${nextInterval.value}`
      );
    };
  //console.log(schedule);
  //console.dir(schedule.times, { depth : null});
  //console.log(typeof(schedule));
 //console.log(timeVal, debugKey);
}

main().catch(console.error);
//getStreet2(1032, "Степана бандери").catch(console.error)
//getCity().catch(console.error)
module.exports = { getCity, getStreet, getBuildName, getGroups, generateKey, getSchedule, compressTime, formatDate, getCurrentInterval, getNextInterval };
