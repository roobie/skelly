export var QueryFilterFlags;
(function (QueryFilterFlags) {
    QueryFilterFlags[QueryFilterFlags["EXCLUDE_FIXED"] = 1] = "EXCLUDE_FIXED";
    QueryFilterFlags[QueryFilterFlags["EXCLUDE_KINEMATIC"] = 2] = "EXCLUDE_KINEMATIC";
    QueryFilterFlags[QueryFilterFlags["EXCLUDE_DYNAMIC"] = 4] = "EXCLUDE_DYNAMIC";
    QueryFilterFlags[QueryFilterFlags["EXCLUDE_SENSORS"] = 8] = "EXCLUDE_SENSORS";
    QueryFilterFlags[QueryFilterFlags["EXCLUDE_SOLIDS"] = 16] = "EXCLUDE_SOLIDS";
    QueryFilterFlags[QueryFilterFlags["ONLY_DYNAMIC"] = 3] = "ONLY_DYNAMIC";
    QueryFilterFlags[QueryFilterFlags["ONLY_KINEMATIC"] = 5] = "ONLY_KINEMATIC";
    QueryFilterFlags[QueryFilterFlags["ONLY_FIXED"] = 6] = "ONLY_FIXED";
})(QueryFilterFlags || (QueryFilterFlags = {}));
