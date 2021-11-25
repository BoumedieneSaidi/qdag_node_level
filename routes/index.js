const { response } = require("express");
var express = require("express");
var router = express.Router();
//la session de l'utilisateur
var userSession;
// mod.cjs
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
/************************ Utils functions **********************/
function getRandomArbitrary(min, max) {
  return Math.random() * (max - min) + min;
}
function setResultParameters(initialQueryConfig, exectTime, nbrResult, result) {
  initialQueryConfig["execTimeQDAG"] = exectTime;
  initialQueryConfig["nbrResult"] = nbrResult;
  initialQueryConfig["result"] = result;
}
/***************************************************************/
/**
 * @param {*} req la requete de l'utilisateur, comprenant l'ensemble des paramétres
 * Cette fonction initialise les variables de la session utilisateur
 * Cette fonction est solicité à l'affichage de la page demo
 */

const { v4: uuidv4 } = require("uuid");
function initSessionVariables(req) {
  if (userSession === undefined) {
    userSession = req.session;
    userSession["idSess"] = uuidv4();
    //Ca represente l'ensemble de combinaison des paramétres d'execution
    userSession["queryParamsGroups"] = new Set(["DB + Query"]); //Une reglé:["DB+Query",.........,"RDF-3X"] suivre cet ordre pour l'affichage
    //Garder une trace sur les différentes éxecutions, pour ne pas les rééxécuté de nouveau
    userSession["history"] = new Map();
    //Les différentes éxecutions de QDAG {Key:DB+query => Value:[String executions]}
    userSession["queriesSeries"] = new Map();
    //Les différente éxecutions de RDF-3X {Key:DB+Query => Value:Exec Time RDF-3x}
    userSession["rDF3XSeries"] = new Map();
    //Est-ce qu'on a éxecuté au moins une fois RDF-3X
    userSession["isRDFExecuted"] = false;
  }
}

/*********************** Les fonctions de formattage des variables de l'utilisateur ********************************/
/**
 * @param {*} queryParams les paramétre d'exécution {l'optimiseur, spatial stratégy et le pruning} => un groupe d'execution
 * @returns a string qui représente l'identifiance de ce groupe ou de l'execution de cette requete Optimizer,With or withou pruning,spatialStrategy
 */
function formatQueryGroup(queryParams) {
  const spatStrategy =
    queryParams["isSpatial"] === "true"
      ? "," + queryParams["spatialStrategy"]
      : "";
  const withElag = queryParams["isElag"] === "true" ? ", With Pruning" : "";
  return queryParams["optimizer"] + withElag + spatStrategy;
}
function formatSeriesExecutions(array) {
  const execAGconfig = {};
  array.forEach((str) => {
    const obj = JSON.parse(str);
    execAGconfig[formatQueryGroup(obj)] = obj;
  });
  return execAGconfig;
}
/**
 * @returns FormatedQueriesSeries Map (DB + Current-key) => {configGroup => (configGroup + result included)}
 */
function formatQueriesSeries() {
  let formatedQueriesSeriesMap = {};
  userSession["queriesSeries"].forEach((seriesExecutions, serieId) => {
    formatedQueriesSeriesMap[serieId] =
      formatSeriesExecutions(seriesExecutions);
  });
  return formatedQueriesSeriesMap;
}
function formatRDFXSeries() {
  let formatedRDFXSeries = {};
  userSession["rDF3XSeries"].forEach(
    (execTime, serieId) => (formatedRDFXSeries[serieId] = execTime)
  );
  return formatedRDFXSeries;
}
function formatQueryParamsGroups() {
  let formatedQueryParamsGroups = [...userSession["queryParamsGroups"]];
  console.log("hipaa", formatedQueryParamsGroups);
  if (userSession["isRDFExecuted"]) formatedQueryParamsGroups.push("RDF-3X");
  return formatedQueryParamsGroups;
}

/****************************************************************************************************************/

/**
 * @param {*} queryParams Les paramétres nécessaire à l'éxecution de QDAG
 * @returns query params object including results
 */
async function executeQDAG(queryParams, sessionID) {
  let serieId = queryParams["currentDB"] + "," + queryParams["queryName"];
  let response = await qdagFetching(
    queryParams["currentDB"],
    queryParams["queryName"],
    sessionID + ";" + queryParams["queryName"] + ";" + queryParams["currentDB"]
  );
  if (Object.keys(response).length === 0) {
    return {};
  }
  //Executer la requete tout en intégrant les résultats aux queries_series
  console.log(
    "Haboouuuuuuuuuuuuuka",
    response["finalResult"]
      .split("\n")
      .map((str, i) => ({ no: i, mapping: str }))
  );
  queryParams["nbrRes"] = response["nbrRes"];
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
  if (userSession["queriesSeries"].has(serieId))
    userSession["queriesSeries"].get(serieId).push(JSON.stringify(queryParams));
  else userSession["queriesSeries"].set(serieId, [JSON.stringify(queryParams)]);
  //ajouter le groupe de paramétre d'éxecution au queryParamsGroups Set
  userSession["queryParamsGroups"].add(formatQueryGroup(queryParams));
  return queryParams;
}
function executeRDF(queryParams, rdfToo) {
  let serieId = queryParams["currentDB"] + "," + queryParams["queryName"];
  if (!userSession["rDF3XSeries"].has(serieId) && rdfToo === "true") {
    userSession["isRDFExecuted"] = true;
    userSession["rDF3XSeries"].set(serieId, getRandomArbitrary(1000, 5000));
  }
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
async function runQuery(queryParams, rdfToo, sessionID) {
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
  if (userSession["history"].has(serieId)) {
    let lastExecutions = userSession["history"].get(serieId);
    if (!lastExecutions.includes(strQuery)) {
      lastExecutions.push(strQuery);
      await executeQDAG(queryParams, sessionID);
      executeRDF(queryParams, rdfToo);
    } else {
      executeRDF(queryParams, rdfToo);
      return formatQueriesSeries()[serieId][formatQueryGroup(queryParams)];
    }
  } else {
    //sinon créer la nouvelle série et éxécuter QDAG

    let respo = await executeQDAG(queryParams, sessionID);
    if (Object.keys(respo).length === 0) return {};
    userSession["history"].set(serieId, [strQuery]);
  }

  executeRDF(queryParams, rdfToo);
  return queryParams;
}

/************************************ Routes  ***************************/
/** À l'affiche de la page demo */
router.get("/demo", function (req, res, next) {
  initSessionVariables(req);
  console.log(userSession);
  res.send({
    queriesSeries: formatQueriesSeries(),
    rDF3XSeries: formatRDFXSeries(),
    queryParamsGroups: formatQueryParamsGroups(),
    isRDFExecuted: userSession["isRDFExecuted"],
  });
});
router.get("/test", async function (req, res, next) {
  let resp = await qdagFetching(
    req.query["db"],
    req.query["queryPath"],
    req.query["resultFile"]
  );
  console.log(resp);
  return res.send({
    result: resp,
  });
});
async function qdagFetching(db, queryPath, resultFile) {
  const response = await fetch(
    "http://localhost:8080/run-query?db=" +
      db +
      "&queryPath=" +
      queryPath +
      "&resultFile=" +
      resultFile
  );
  console.log("Fetchi khoya");
  return await response.json();
}
/** À l'éxecution de la requete */
router.get("/run-query", async function (req, res, next) {
  //Deconstruct la requete en deux chose: 1- Les paramétre d'éxecution de la requete, 2- la possibilité d'éxecuter RDF-3X
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
    userSession["idSess"]
  );
  res.send({
    queriesSeries: formatQueriesSeries(),
    rDF3XSeries: formatRDFXSeries(),
    queryParamsGroups: formatQueryParamsGroups(),
    currentQuery: executedQuery,
    isRDFExecuted: userSession["isRDFExecuted"],
  });
});
router.get("/fetchData", async function (req, res, next) {
  resultFile =
    userSession["idSess"] +
    ";" +
    req.query["currQuery"] +
    ";" +
    req.query["currDb"];
  console.log(
    "9orrrrrrrrrrrrrrrrr:",
    "http://localhost:8080/fetch-data?page=" +
      req.query["page"] +
      "&perPage" +
      req.query["per_page"] +
      "&resultFile=" +
      resultFile
  );
  const response = await fetch(
    "http://localhost:8080/fetch-data?page=" +
      req.query["page"] +
      "&perPage=" +
      req.query["per_page"] +
      "&resultFile=" +
      resultFile
  );
  let resp = await response.json();
  console.log("Leeeeeenght:" + resp["finalResult"].length);
  if (resp["finalResult"].length === 0)
    return res.send({
      data: [],
    });
  let data = {
    data: resp["finalResult"].split("\n").map((str, i) => ({
      no:
        i + (parseInt(req.query["page"]) - 1) * parseInt(req.query["per_page"]),
      mapping: str,
    })),
  };
  return res.send(data);
});
/************************************************************************** */
module.exports = router;
