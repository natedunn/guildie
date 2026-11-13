local wow = dofile("apps/addon/tests/wow.lua")
local ns = wow.load({ guid = "Player-test", name = "Test", level = 26, questApi = "modern", quests = {{id = 6981, title = "The Glowing Shard", complete = 1}} })
wow.fire("PLAYER_ENTERING_WORLD")
wow.fire("QUEST_LOG_UPDATE")
assert(ns.current().completedQuestIds == nil, "objectives complete is not a turn-in")
wow.state.quests = {}
wow.fire("QUEST_LOG_UPDATE")
assert(ns.current().completedQuestIds == nil, "removal/abandonment is not a turn-in")

-- Drop/batch all scheduled work: every event must still be retained immediately.
local pending = {}
C_Timer = {After = function(_, callback) pending[#pending + 1] = callback end}
wow.fire("QUEST_TURNED_IN", 6981)
wow.fire("QUEST_TURNED_IN", 3369)
wow.fire("QUEST_TURNED_IN", 6981)
wow.fire("QUEST_TURNED_IN", -1)
wow.fire("QUEST_TURNED_IN", "123")
wow.fire("QUEST_TURNED_IN", 1.5)
local secret = {}
issecretvalue = function(value) return value == secret end
wow.fire("QUEST_TURNED_IN", secret)
assert(table.concat(ns.current().completedQuestIds, ",") == "3369,6981", "burst is retained and deduplicated before timers")
-- Logout cannot wait for the delayed callbacks.
wow.fire("PLAYER_LOGOUT")
local saved = GuildieDB
assert(wow.decode(saved.payload).version == 6)
assert(table.concat(wow.decode(saved.payload).characters[1].completedQuestIds, ",") == "3369,6981")
for _, callback in ipairs(pending) do callback() end
ns = wow.load({db = saved, guid = "Player-test", name = "Test", level = 26})
wow.fire("PLAYER_ENTERING_WORLD")
assert(table.concat(ns.current().completedQuestIds, ",") == "3369,6981", "history survives reload without APIs")

C_QuestLog = {GetAllCompletedQuestIDs = function() return {999, 3369, 0, "bad", 3.5} end}
wow.fire("QUEST_LOG_UPDATE")
assert(table.concat(ns.current().completedQuestIds, ",") == "999,3369,6981", "history adds missing IDs")
C_QuestLog.GetAllCompletedQuestIDs = function() return {} end
wow.fire("QUEST_LOG_UPDATE")
assert(#ns.current().completedQuestIds == 3, "empty history cannot erase confirmations")
C_QuestLog.GetAllCompletedQuestIDs = function() error("not ready") end
wow.fire("QUEST_LOG_UPDATE")
assert(#ns.current().completedQuestIds == 3, "failed history cannot erase confirmations")
GetQuestsCompleted = function(out) out[1234] = true; out[999] = 1; out[5678] = false end
wow.fire("QUEST_QUERY_COMPLETE")
assert(table.concat(ns.current().completedQuestIds, ",") == "999,1234,3369,6981", "legacy history only adds positive confirmations")
local queried = false
QueryQuestsCompleted = function() queried = true end
wow.fire("PLAYER_ENTERING_WORLD")
assert(queried, "legacy asynchronous history requested")
ns = wow.load({db = saved, guid = "Player-other", name = "Other"})
wow.fire("PLAYER_ENTERING_WORLD")
assert(ns.current().completedQuestIds == nil, "history is per character")
wow.fire("QUEST_TURNED_IN", 4321)
assert(table.concat(ns.current().completedQuestIds, ",") == "4321")
print("Quest completion backlog passed")
