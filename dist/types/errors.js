export var Errors;
(function (Errors) {
    // QUEUE RELATED
    Errors["queueFull"] = "Queue is full";
    Errors["inQueue"] = "You already in the queue\nRefreshing timeout!";
    Errors["notInQueue"] = "You are not in this queue";
    Errors["notQueue"] = "This is not a queue";
    Errors["queueNotActive"] = "This queue has been disabled";
    // COMMAND RELATED
    Errors["notEnoughPerms"] = "You don't have the required role to use this command";
    Errors["queueBanned"] = "You are queue banned";
    Errors["alreadyRegistered"] = "User is already registered";
    Errors["wrongChannel"] = "This command cannot be used in this channel";
    Errors["missingArgs"] = "The command is missing some required arguments";
    Errors["invalidNumber"] = "Please provide a valid number";
    Errors["commandDisabled"] = "Command has been disabled for this channel";
    Errors["shuffleLimit"] = "Cannot shuffle game more than two times";
    Errors["shuffleInProgress"] = "Another shuffle is in progress for this game";
    Errors["gameNotFound"] = "Game not found";
    Errors["processInProgress"] = "Another process is in progress for this game";
    Errors["invalidGame"] = "Cannot run that command on this game";
    Errors["userNotInGame"] = "User is not in game";
    Errors["userInGame"] = "User already in game";
    // USER RELATED
    Errors["userIsBot"] = "The mentioned user is a bot";
    Errors["userNotRegistered"] = "User is not registered";
    Errors["userNotFound"] = "User not found";
    // STATS RELATED
    Errors["noUserStats"] = "No saved stats for this user";
    // SLASH COMMANDS
    Errors["invalidDuration"] = "Please enter a valid duration";
})(Errors || (Errors = {}));
