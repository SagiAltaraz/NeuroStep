const { queryRef, executeQuery, mutationRef, executeMutation, validateArgs } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'example',
  service: 'neurostep',
  location: 'us-east4'
};
exports.connectorConfig = connectorConfig;

const createNewUserRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CreateNewUser', inputVars);
}
createNewUserRef.operationName = 'CreateNewUser';
exports.createNewUserRef = createNewUserRef;

exports.createNewUser = function createNewUser(dcOrVars, vars) {
  return executeMutation(createNewUserRef(dcOrVars, vars));
};

const getGameTypesRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetGameTypes');
}
getGameTypesRef.operationName = 'GetGameTypes';
exports.getGameTypesRef = getGameTypesRef;

exports.getGameTypes = function getGameTypes(dc) {
  return executeQuery(getGameTypesRef(dc));
};

const getUserTrainingSessionsRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetUserTrainingSessions', inputVars);
}
getUserTrainingSessionsRef.operationName = 'GetUserTrainingSessions';
exports.getUserTrainingSessionsRef = getUserTrainingSessionsRef;

exports.getUserTrainingSessions = function getUserTrainingSessions(dcOrVars, vars) {
  return executeQuery(getUserTrainingSessionsRef(dcOrVars, vars));
};

const updateTrainingSessionFeedbackRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateTrainingSessionFeedback', inputVars);
}
updateTrainingSessionFeedbackRef.operationName = 'UpdateTrainingSessionFeedback';
exports.updateTrainingSessionFeedbackRef = updateTrainingSessionFeedbackRef;

exports.updateTrainingSessionFeedback = function updateTrainingSessionFeedback(dcOrVars, vars) {
  return executeMutation(updateTrainingSessionFeedbackRef(dcOrVars, vars));
};
