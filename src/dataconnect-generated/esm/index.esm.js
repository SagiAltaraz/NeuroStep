import { queryRef, executeQuery, mutationRef, executeMutation, validateArgs } from 'firebase/data-connect';

export const connectorConfig = {
  connector: 'example',
  service: 'neurostep',
  location: 'us-east4'
};

export const createNewUserRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CreateNewUser', inputVars);
}
createNewUserRef.operationName = 'CreateNewUser';

export function createNewUser(dcOrVars, vars) {
  return executeMutation(createNewUserRef(dcOrVars, vars));
}

export const getGameTypesRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetGameTypes');
}
getGameTypesRef.operationName = 'GetGameTypes';

export function getGameTypes(dc) {
  return executeQuery(getGameTypesRef(dc));
}

export const getUserTrainingSessionsRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetUserTrainingSessions', inputVars);
}
getUserTrainingSessionsRef.operationName = 'GetUserTrainingSessions';

export function getUserTrainingSessions(dcOrVars, vars) {
  return executeQuery(getUserTrainingSessionsRef(dcOrVars, vars));
}

export const updateTrainingSessionFeedbackRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateTrainingSessionFeedback', inputVars);
}
updateTrainingSessionFeedbackRef.operationName = 'UpdateTrainingSessionFeedback';

export function updateTrainingSessionFeedback(dcOrVars, vars) {
  return executeMutation(updateTrainingSessionFeedbackRef(dcOrVars, vars));
}

