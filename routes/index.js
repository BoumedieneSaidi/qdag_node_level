/************************** Declaration ***************************/
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { response } = require("express");
var express = require("express");
var md5 = require("md5");
var router = express.Router();
//la session de l'utilisateur
var userSession;
var hashedPassword =
  "$2a$08$wMaRPzpH2krYdfqLDiuCPOchhnAxOJCfJ4DjbbLCWaPUE2N4RPwSS";
//Importer la fonction fetch pour faire des appels HTTL
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
//uuid elle est utilisée pour générér aléatoirement des ids de session
const { v4: uuidv4 } = require("uuid");
/********************************************************************/
/*var app = express();
const session = require("express-session");
app.use(
  session({
    resave: false,
    secret: "123456",
    saveUninitialized: true,
  })
);*/
/************************ Utils functions **********************/
//générer un temps d'éxecution aléatoire dans l'intrevalle [min,max]
function getRandomArbitrary(min, max) {
  return Math.random() * (max - min) + min;
}

//Sauvagarder les params des résultats dans l'objet initialQueryConfig
function setResultParameters(
  initialQueryConfig,
  exectTimeQDAG,
  nbrResult,
  result
) {
  initialQueryConfig["execTimeQDAG"] = exectTimeQDAG;
  initialQueryConfig["nbrResult"] = nbrResult;
  initialQueryConfig["result"] = result;
}
/**
 * @param {*} req la requete de l'utilisateur, comprenant l'ensemble des paramétres
 * Cette fonction initialise les variables de la session utilisateur
 * Cette fonction est solicité à l'affichage de la page demo
 */

function initSessionVariables(req) {
  if (req.session["idSess"] === undefined) {
    req.session["idSess"] = uuidv4();
    //Ca represente l'ensemble de combinaison des paramétres d'execution
    req.session["queryParamsGroups"] = ["DB + Query"]; //Une reglé:["DB+Query",.........,"RDF-3X"] suivre cet ordre pour l'affichage
    //Garder une trace sur les différentes éxecutions, pour ne pas les rééxécuté de nouveau
    req.session["history"] = new Map();
    //Les différentes éxecutions de QDAG {Key:DB+query => Value:[String executions]}
    req.session["queriesSeries"] = new Map();
    //Les différente éxecutions de RDF-3X {Key:DB+Query => Value:Exec Time RDF-3x}
    req.session["rDF3XSeries"] = new Map();
    req.session["virtuosoSeries"] = new Map();
    //Est-ce qu'on a éxecuté au moins une fois RDF-3X
    req.session["isRDFExecuted"] = false;
    req.session["isVirtuosoExecuted"] = false;
  }
}
/********************************************************************/

/*********************** Les fonctions de formattage des variables de l'utilisateur ********************************/
/**
 *
 * @param {*} queryParams l'objet qui contient l'ensemble des paramétres d'éxecution de la requettes
 * @returns optimizer,true|false => dépends du paramétre de l'élagage, true|false si la requete est spatiale ou non
 * La chaine de caractére retournée represente une colonne dans la figure de statistique
 * cette colonne fait partie d'une série d'éxecution concernant la requete
 */
function formatQueryGroup(queryParams) {
  const spatStrategy =
    queryParams["isSpatial"] === "true"
      ? "," + queryParams["spatialStrategy"]
      : "";
  const withElag = queryParams["isElag"] === "true" ? ", With Pruning" : "";
  return queryParams["optimizer"] + withElag + spatStrategy;
}

/**
 * @param {*} configsArr contient l'ensemble des configuration [optimizer,isElage,IsSpati]
 * @returns cette fonction fait du mappin du tableau de strings à un autre tableau de string
 * mais avec un affichage plus adapté dans la figure de stat => Map < ConfigExec => Result>
 */
function formatSeriesExecutions(configsArr) {
  const execAGconfig = {};
  configsArr.forEach((str) => {
    const obj = JSON.parse(str);
    execAGconfig[formatQueryGroup(obj)] = obj;
  });
  return execAGconfig;
}
/**
 * cette fonction map les séries d'éxecution, de te facon que ca donne
 * Map<SerieID(CurrenDB+CurrentQuery) => Map<ConfigExec => Result>>
 */
function formatQueriesSeries(req) {
  let formatedQueriesSeriesMap = {};
  const map = new Map(Object.entries(req.session["queriesSeries"]));
  map.forEach((seriesExecutions, serieId) => {
    formatedQueriesSeriesMap[serieId] =
      formatSeriesExecutions(seriesExecutions);
  });
  return formatedQueriesSeriesMap;
}
function formatRDFXSeries(req) {
  let formatedRDFXSeries = {};
  const map = new Map(Object.entries(req.session["rDF3XSeries"]));
  map.forEach((execTime, serieId) => (formatedRDFXSeries[serieId] = execTime));
  return formatedRDFXSeries;
}
function formatVirtuosoSeries(req) {
  let formatedVirtuosoSeries = {};
  const map = new Map(Object.entries(req.session["virtuosoSeries"]));
  map.forEach((execTime, serieId) => (formatedVirtuosoSeries[serieId] = execTime));
  return formatedVirtuosoSeries
}
/**
 * userSession["queryParamsGroups"]] contient les différente configuration d'éxecution
 * @returns formatedQueryParamsGroups les différente configuration d'éxecution, si on a
 * déja executé RDF-3X on l'ajoute aux paramétre d'execution une et une seule fois
 */
function formatQueryParamsGroups(req) {
  let formatedQueryParamsGroups = [...req.session["queryParamsGroups"]];
  if (req.session["isVirtuosoExecuted"]) formatedQueryParamsGroups.push("Virtuoso");
  if (req.session["isRDFExecuted"]) formatedQueryParamsGroups.push("RDF-3X");
  return formatedQueryParamsGroups;
}

/****************************************************************************************************************/

/**
 * @param {*} queryParams Les paramétres nécessaire à l'éxecution de QDAG
 * @returns query params object including results
 */
async function executeQDAG(queryParams, sessionID, req) {
  try {
    let serieId = queryParams["currentDB"] + "," + queryParams["queryName"];
    let spatStra =
      queryParams["isSpatial"] === "true"
        ? ";" + queryParams["spatialStrategy"]
        : "";
    let strFileName =
      sessionID +
      ";" +
      queryParams["queryName"] +
      ";" +
      queryParams["currentDB"] +
      ";" +
      queryParams["optimizer"] +
      ";" +
      queryParams["isElag"] +
      ";" +
      queryParams["isSpatial"] +
      spatStra;
    let hash = md5(strFileName);
    let response = await qdagFetching(
      queryParams["currentDB"],
      queryParams["queryName"],
      hash,
      queryParams["optimizer"],
      queryParams["isElag"]
    );
    if (Object.keys(response).length === 0) {
      return {};
    }
    //Executer la requete tout en intégrant les résultats aux queries_series
    queryParams["nbrRes"] = response["nbrRes"];
    queryParams["resultFile"] = hash;
    setResultParameters(
      queryParams,
      parseInt(response["execTime"]),
      getRandomArbitrary(1000, 5000),
      response["finalResult"].length == 0
        ? []
        : response["finalResult"]
            .split("\n")
            .map((str, i) => ({ no: i, mapping: str }))
    );
    if (req.session["queriesSeries"][serieId] !== undefined)
      req.session["queriesSeries"][serieId].push(JSON.stringify(queryParams));
    else req.session["queriesSeries"][serieId] = [JSON.stringify(queryParams)];
    //ajouter le groupe de paramétre d'éxecution au queryParamsGroups Set
    if (
      !req.session["queryParamsGroups"].includes(formatQueryGroup(queryParams))
    ) {
      req.session["queryParamsGroups"].push(formatQueryGroup(queryParams));
    }

    return queryParams;
  } catch (err) {}
}
async function executeRDF(queryParams, rdfToo, req) {
  try {
    let serieId = queryParams["currentDB"] + "," + queryParams["queryName"];
    if (
      req.session["rDF3XSeries"][serieId] === undefined &&
      rdfToo === "true"
    ) {
      const response = await fetch(
        process.env.NODE_APP_API_URL +
          "/run-rdf3x?db=" +
          queryParams["currentDB"] +
          "&query=" +
          queryParams["queryName"]
      );
      let resp = await response.json();
      req.session["isRDFExecuted"] = true;
      req.session["rDF3XSeries"][serieId] = parseInt(resp["rdfExecTime"]);
    }
  } catch (err) {}
}
async function executeVirtuoso(queryParams, virtuosoToo, req) {
  try {
    let serieId = queryParams["currentDB"] + "," + queryParams["queryName"];
    if (
      req.session["virtuosoSeries"][serieId] === undefined &&
      virtuosoToo === "true"
    ) {
      const response = await fetch(
        process.env.NODE_APP_API_URL +
          "/run-virtuoso?db=" +
          queryParams["currentDB"] +
          "&query=" +
          queryParams["queryName"]
      );
      let resp = await response.json();
      console.log(resp);
      req.session["isVirtuosoExecuted"] = true;
      req.session["virtuosoSeries"][serieId] = parseInt(resp["virtuosoExecTime"]);
    }
  } catch (err) {}
}
/**
 * @param {*} queryParamsObj L'objet contenant l'ensemble des params d'éxécution
 * @param {*} paramsArr L'array des paramétres d'éxecution sollicité for the object
 * @returns formatted json object en se basant sur params Arr
 */
function fetchQuerySpecificParams(queryParamsObj, paramsArr) {
  let specificQueryParamsObj = {};
  for (let i = 0; i < paramsArr.length; i++)
    specificQueryParamsObj[paramsArr[i]] = queryParamsObj[paramsArr[i]];
  return JSON.stringify(specificQueryParamsObj);
}
/**
 * @param {*} queryParams les paramétres d'executions de la requete
 * @param {*} rdfToo si l'utilisateurs veut comparer avec RDF-3X
 * @returns un objet comprenant toutes paramétres d'execution + ceux du résultat
 */
async function runQuery(queryParams, rdfToo,virtuosoToo, sessionID, req) {
  try {
    console.log("Virutoso toooo:",virtuosoToo)
    //L'id de la série => on peut dire l'id de la requete {DbName,queryName}
    let serieId = queryParams["currentDB"] + "," + queryParams["queryName"];
    const strQuery = fetchQuerySpecificParams(queryParams, [
      "currentDB",
      "query",
      "optimizer",
      "isElag",
      "isSpatial",
      "spatialStrategy",
      "queryName",
    ]);
    //tester si on a éxécuté la requete aux moins une fois
    if (req.session["history"][serieId] !== undefined) {
      let lastExecutions = req.session["history"][serieId];
      if (!lastExecutions.includes(strQuery)) {
        lastExecutions.push(strQuery);
        await executeQDAG(queryParams, sessionID, req);
        await executeRDF(queryParams, rdfToo, req);
        await executeVirtuoso(queryParams, virtuosoToo, req);
      } else {
        await executeRDF(queryParams, rdfToo, req);
        await executeVirtuoso(queryParams, virtuosoToo, req);
        return formatQueriesSeries(req)[serieId][
          formatQueryGroup(queryParams, req)
        ];
      }
    } else {
      //sinon créer la nouvelle série et éxécuter QDAG
      let respo = await executeQDAG(queryParams, sessionID, req);
      if (Object.keys(respo).length === 0) return {};
      req.session["history"][serieId] = [strQuery];
    }
    await executeVirtuoso(queryParams, virtuosoToo, req);
    await executeRDF(queryParams, rdfToo, req);
    return queryParams;
  } catch (err) {}
}

/************************************ Routes  ***************************/
/** À l'affiche de la page demo */
router.get("/demo", function (req, res, next) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    process.env.NODE_APP_REACT_ORIGIN
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");
  initSessionVariables(req);
  res.send({
    queriesSeries: formatQueriesSeries(req),
    rDF3XSeries: formatRDFXSeries(req),
    virtuosoSeries: formatVirtuosoSeries(req),
    queryParamsGroups: formatQueryParamsGroups(req),
    isRDFExecuted: req.session["isRDFExecuted"],
  });
});

async function qdagFetching(db, queryPath, resultFile, optimizer, isPrun) {
  try {
    const response = await fetch(
      process.env.NODE_APP_API_URL +
        "/run-query?db=" +
        db +
        "&queryPath=" +
        queryPath +
        "&resultFile=" +
        resultFile +
        "&optimizer=" +
        optimizer +
        "&isPrun=" +
        isPrun
    );
    return await response.json();
  } catch (err) {}
}
/** À l'éxecution de la requete */
router.get("/run-query", async function (req, res, next) {
  initSessionVariables(req);
  res.setHeader(
    "Access-Control-Allow-Origin",
    process.env.NODE_APP_REACT_ORIGIN
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");
  //Deconstruct la requete en deux chose: 1- Les paramétre d'éxecution de la requete, 2- la possibilité d'éxecuter RDF-3X
  try {
    const {
      currentDB,
      query,
      optimizer,
      isElag,
      isSpatial,
      spatialStrategy,
      queryName,
    } = req.query;
    const queryParams = {
      currentDB: currentDB,
      query: query,
      optimizer: optimizer,
      isElag: isElag,
      isSpatial: isSpatial,
      spatialStrategy: spatialStrategy,
      queryName: queryName,
    };
    //éxecuter la requete, retourner un objet comprenant Les params d'éxecutions initiales + les paramétres de résultat
    let executedQuery = await runQuery(
      queryParams,
      req.query["rdfToo"],
      req.query["virtuosoToo"],
      req.session["idSess"],
      req
    );
    res.send({
      queriesSeries: formatQueriesSeries(req),
      rDF3XSeries: formatRDFXSeries(req),
      virtuosoSeries: formatVirtuosoSeries(req),
      queryParamsGroups: formatQueryParamsGroups(req),
      currentQuery: executedQuery,
      isRDFExecuted: req.session["isRDFExecuted"],
      isVirtuosoExecuted: req.session["isVirtuosoExecuted"],
    });
  } catch (err) {}
});
//Get Result Data per Page [Default Page Size = 10]
router.get("/fetchData", async function (req, res, next) {
  try {
    res.setHeader(
      "Access-Control-Allow-Origin",
      process.env.NODE_APP_REACT_ORIGIN
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");
    //Ou les résultats sont stockées
    const response = await fetch(
      process.env.NODE_APP_API_URL +
        "/fetch-data?page=" +
        req.query["page"] +
        "&perPage=" +
        req.query["per_page"] +
        "&resultFile=" +
        req.query["resultFile"]
    );
    let resp = await response.json();
    //Si on en a pas de résultat on retourne un tableau vide
    let result = resp["finalResult"];
    if (result.length === 0)
      return res.send({
        data: [],
      });
    //Sinon on fait un mapping des résultats pour s'adapter au data table <no (1ére colonne du tab, numéro du mapping)
    //,mapping 2éme colonne du tableau ca représente le mapping lui meme
    let data = {
      data: result.split("\n").map((resultStr, i) => ({
        no:
          i +
          (parseInt(req.query["page"]) - 1) * parseInt(req.query["per_page"]),
        mapping: resultStr,
      })),
    };
    return res.send(data);
  } catch (err) {}
});
router.post("/login", (req, res) => {
  res.setHeader(
    "Access-Control-Allow-Origin",
    process.env.NODE_APP_REACT_ORIGIN
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.body.password === undefined) {
    res.send({
      status: "user name or password error",
    });
    return;
  }
  bcrypt.compare(req.body.password, hashedPassword).then((isEqual) => {
    if (req.body.username === "admin" && isEqual)
      res.send({
        token: "test123",
      });
    else
      res.send({
        status: "user name or password error",
      });
  });
});
router.post("/change-spring-url", (req, res) => {
  res.setHeader(
    "Access-Control-Allow-Origin",
    process.env.NODE_APP_REACT_ORIGIN
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");
  process.env.NODE_APP_API_URL = req.body.springUrl;
  res.send({
    status: "Spring URL changed successfully",
  });
});
router.get("/clear-session", (req, res) => {
  res.setHeader(
    "Access-Control-Allow-Origin",
    process.env.NODE_APP_REACT_ORIGIN
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");
  req.session["idSess"] = undefined;
  res.send({
    status: "Session updated",
  });
});
router.get("/new-version", (req, res) => {
  res.send({
    status: "Session updated",
  });
});
/************************************************************************** */
module.exports = router;
