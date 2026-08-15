/* ================= 我的原则（principles） =================
 * 源于《原则》：系统化管理生活/工作/学习/理财/思维模型/误判心理学/人生策略
 * 功能：原则库 + 定期审视 + 原则日志 + 数据统计
 * 布局与当前项目保持一致（card / chips / badge / field / btn）。
 * 数据模型（DB.principles）：
 *   principles: [{ id, cat, title, point, content, cycle, status, fav, created }]
 *   reviews:    [{ id, pid, title, date, score, verdict, practice, reflect, goal }]
 *   goals:      [{ id, name, cat, desc, progress, due, status, note }]
 *   logs:       [{ id, date, pid, title, scene, act, reflect, score }]
 */
(function(){
  const PCATS = ['生活原则','工作原则','学习原则','理财原则','思维模型','误判心理学','人生策略'];
  const CYCLES = ['每周','每两周','每月','每季度'];
  const CYCLE_DAYS = { '每周':7, '每两周':14, '每月':30, '每季度':90 };
  const CAT_COLORS = {
    '生活原则':'#2563eb','工作原则':'#7c3aed','学习原则':'#059669','理财原则':'#d97706',
    '思维模型':'#db2777','误判心理学':'#dc2626','人生策略':'#0891b2'
  };
  const GOAL_COLORS = { '减脂塑形':'#ef4444','求职准备':'#2563eb','阅读笔记':'#059669','副业探索':'#7c3aed' };

  function seed(){
    return {
      seedDataVersion: 1,  // v1: 从 Notes-MyLifeView 整理并入 67 条原则（含生活/工作/学习/理财/思维模型/误判心理学）
      principles: [
        { id:uid(), cat:'生活原则', title:'保持头脑开放', point:'头脑极度开放+极度透明，倾听他人建议',
          content:'对于快速学习和有效改变而言，头脑极度开放、极度透明是价值无限的。保持头脑开放才能找到更合理的途径。不要担心其他人的看法，使之成为障碍。乐于倾听身边同事和同学的建议，思考其合理性，很大情况下他们看到了你没看到的因果关系。',
          cycle:'每月', status:'进行中', fav:true, created:'2026-08-15' },
        { id:uid(), cat:'生活原则', title:'行动力：行动先于情绪', point:'用行动改变情绪，酝酿10次不如行动1次',
          content:'行动对情绪的影响要比思维对情绪的影响大一倍。酝酿10次不如行动1次。很多迟迟不肯行动是因为宏大叙事幻觉，原创是做出来的，不是憋出来的。',
          cycle:'每周', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'生活原则', title:'习惯改变：提示-渴求-反应-奖励', point:'微习惯+外力约束+正向反馈，用行动改变情绪',
          content:'通过建立微习惯进入学习、锻炼、思考的状态；充分借助外界的力量（公开承诺、防逃机制）；强化正向反馈（即时奖励、记录成就）。拖延不是时间管理问题，而是情绪管理问题。',
          cycle:'每周', status:'进行中', fav:true, created:'2026-08-15' },
        { id:uid(), cat:'生活原则', title:'早睡早起', point:'作息是基本盘，保持规律',
          content:'保持规律作息，早睡早起，为深度工作与健康生活提供基础。',
          cycle:'每周', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'工作原则', title:'从不完美出发', point:'先做出粗糙版本，再迭代',
          content:'任何项目都可以从不完美、粗糙出发，不断迭代，做而非不停思考怎么做。不要无限放大启动成本。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'思维模型', title:'二阶思维（多米诺骨牌效应）', point:'永远多想一步连锁反应',
          content:'超越直接后果（一阶思维），预测连锁反应。在做决策时，设想出所有可能倒下的多米诺骨牌。',
          cycle:'每季度', status:'进行中', fav:false, created:'2026-08-15' },
        // ===== 生活原则 =====
        { id:uid(), cat:'生活原则', title:'寻找人生方向', point:'边做边探索，选择你"过分好奇"的东西',
          content:'和合适的人结婚、在正确的道路上奋斗十年 > 单身奋斗 > 和错误的人结婚。没有稳定和标准剧本，关键在于变化中学习的能力与重新选择的勇气。跳出"做题家"陷阱，把力气用在别人没注意到的问题上。最安全的指南针：选择你觉得"过分好奇"的东西，哪怕别人觉得无聊，你却很上头想钻研到底——那很可能就是你的天命所归。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'生活原则', title:'行动指南', point:'原创是做出来的，不是憋出来的',
          content:'很多人迟迟不行动是因为"宏大叙事"幻觉，觉得要先憋出惊世骇俗的创意。原创是一种习惯：保持大量问题，持续动手去试，写下来、讲出来、走路发呆、跨领域学习都能促进火花。警惕"项目级拖延"——用看起来很忙的小任务逃避真正想做的大项目，每天自问："我现在做的，是我内心最想做的那件事吗？"',
          cycle:'每周', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'生活原则', title:'被默认行为覆盖的系统', point:'你成为什么，取决于"不想做时"默认会做什么',
          content:'一个人最终成为什么，不取决于他知道什么是对的，而取决于在"不想做、没状态、不理想"时默认会做什么。好习惯降低启动成本、绑定正反馈；坏习惯反之。通过 Habits + Structure + Review 实现规划与目标。',
          cycle:'每周', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'生活原则', title:'延迟满足感', point:'用习惯和降低难度对抗人性',
          content:'人的本性抗拒延迟满足，但可以通过培养习惯、降低实现路径的难度来实现延迟满足。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'生活原则', title:'自信原则', point:'我大于我所有的问题',
          content:'自信能解决大多数问题。看清真实的自己，发现自己真正的潜力。我大于我所有的问题——不因暂时的困难否定自我价值。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'生活原则', title:'积极主动原则', point:'个人行为取决于自身抉择而非外在环境',
          content:'积极主动不仅指行事态度，还意味着人一定要对自己的人生负责。个人行为取决于自身的抉择，而不是外在的环境，人类应有营造有利外在环境的积极性和责任感。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'生活原则', title:'承认情绪但不被其控制', point:'意识、思维、情绪三者分离',
          content:'即使在最极端环境中，人依然拥有选择的自由（《追寻生命的意义》）。接纳不适感：焦虑源于对压力/失败的恐惧；允许情绪存在，仍积极做自己能控制的事。通过冥想提高情绪发作前思考与选择的能力。所谓开悟，就是意识到思维和情绪均不是我。',
          cycle:'每周', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'生活原则', title:'认清自己的优劣势', point:'理性评估而非草率跟风',
          content:'许多感兴趣的领域其实并不擅长，很多时候只是跟风。优势：沉浸式规划、热爱学习、丰富想象力、多学科涉猎。劣势：领域沉淀不足、缺少场景经验、自制力弱（根因是习惯）、心理承受力差（根因是认知与反馈）。改变劣势要用根因思维，而非贴上"我天生不行"的标签。',
          cycle:'每季度', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'生活原则', title:'消除固有偏见', point:'自然走向整体最优化，多数人只根据自身影响判断好坏',
          content:'人的记忆认知常倾向对自己有利的部分，这是偏见与矛盾的主因。对社会、他人、生活的很多消极结论都没经过验证，凭好恶草率得出。应保持更开放思维：未经实践不下结论，即使经过实践也要警惕假设条件是否仍成立。对与自己很不同的人，差异不等于人品问题，保持开放头脑看待其合理性。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'生活原则', title:'与人交流的原则', point:'真诚沟通是必杀技',
          content:'真诚、适度、开放学习、关注对方观点与情绪。避免夸张表达来吸引注意（真诚适度是信任基石）。对模糊领域多学习而非凭喜好坚持观念。闲聊核心是建立舒适连接与信任（用开放式提问、真诚分享），而非急于形成共识。用事实代替评判，阐明需求而非指责，巧用"顺让法"先认同再委婉提意见。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'生活原则', title:'远离只会抱怨的人', point:'他们只带来负面情绪，无论他们是谁',
          content:'远离那些只会抱怨的人，他们只会带来负面情绪，无论他们是谁。',
          cycle:'每季度', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'生活原则', title:'保持行为开放', point:'主动争取机会，增加可能性的概率',
          content:'主动去尝试没经历过的经历，多去没去过的地方、参加没参加过的活动，增加遇到机会的可能性。当机会不主动争取就会丢失时，主动争取、主动向他人提出请求、主动联系可能的人。',
          cycle:'每周', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'生活原则', title:'重要事情处理原则', point:'立即着手，用"五步法"实现目标',
          content:'立即着手去做，不要等待，等待意味着机会流失。按"五步法"实现目标：明确目标 → 找出问题不容忍问题 → 诊断问题找到根源 → 规划方案 → 坚定执行方案。谨记：如果你找到了解决方案，弱点是不重要的。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'生活原则', title:'快速解决真正的困难', point:'找关键问题逐个击破，建立正向循环',
          content:'面对难以解决的困难会焦虑逃避，陷入恶性循环。要跳出循环：找出困难中真正关键的问题，一步步解决，获得正向反馈与信心。全面分析内因外因，勇敢面对，制定计划并通过行动解决根因，总结教训。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        // ===== 工作原则 =====
        { id:uid(), cat:'工作原则', title:'身份认知', point:'利用AI与数据洞察驱动企业增长',
          content:'我的身份定位：利用人工智能技术，通过数据洞察驱动企业核心业务增长的算法工程师。用数据思维、建模方法、机器学习/深度学习构建核心竞争力。',
          cycle:'每季度', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'工作原则', title:'完成好过完美', point:'用"立即行动"替代"非黑即白"思维',
          content:'挑战"必须完美""等有动力再做"的错误信念。接受"完成比完美更重要"，从微小进展开始。最近结果而非过程决定对满意度的评价——先交付可用版本，再迭代优化。',
          cycle:'每周', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'工作原则', title:'以终为始', point:'先心智创造，再实际创造',
          content:'建立人生终极目标，以目标为导向，行动前明确最终愿景并逆向规划路径。通过心智创造（第一次创造）指导实际创造（第二次创造），确保每步与终极目标一致，拆解可执行分段目标。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'工作原则', title:'复盘思维', point:'回顾目标-评估策略-反思过程-优化行动',
          content:'我们无法在原有认知水平上解决原有问题。复盘帮你沉淀经验、萃取知识、解决问题、提高效率。四步：回顾目标 → 评估策略 → 反思过程 → 优化行动。',
          cycle:'每周', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'工作原则', title:'复杂问题拆解', point:'拆解为可执行的"下一步行动"',
          content:'将大目标分解为可执行的下一步行动（如"写报告"→"列大纲→找3篇资料"）。用番茄工作法避免疲劳拖延；对抗拒的任务承诺"只做5分钟"，降低心理阻力，一旦开始惯性会推动继续。',
          cycle:'每周', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'工作原则', title:'极度专业化', point:'做不好不如不做',
          content:'做任何工作都以一定标准要求。核心技能（数据分析思维、数据建模、机器学习/深度学习）要深入学习达到极高水平，形成真正的专业壁垒。',
          cycle:'每季度', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'工作原则', title:'打造允许犯错的文化', point:'不容忍罔顾教训、一错再错',
          content:'打造允许犯错、但不容忍罔顾教训一错再错的文化。失败是学习机会，但重复同样错误不可接受。',
          cycle:'每季度', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'工作原则', title:'保持开放心态同时坚定果断', point:'开放不等于摇摆',
          content:'保持开放心态听取不同意见，同时也要坚定果断地做出决策并执行。开放是为了获取信息，果断是为了推进结果，二者不冲突。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'工作原则', title:'专注提高效率的工作', point:'专注一件事快速完成',
          content:'专注一件事想办法快速完成，而非在不同工作间低效切换。对不懂的问题多问，让拥有比较优势的人帮忙。思考什么是更重要的工作，专注于此。',
          cycle:'每周', status:'进行中', fav:false, created:'2026-08-15' },
        // ===== 学习原则 =====
        { id:uid(), cat:'学习原则', title:'直觉', point:'直觉与逻辑相悖时，是打开新世界大门的时候',
          content:'直觉是学习和解释任何学科最重要的东西。过往最大错误：遇到直觉解释不了的事物，没有努力更新直觉，而是不再相信。直觉与逻辑、现实相悖时，是打开新世界大门的时候。当你对领域学得够深走到知识前沿，会发现它并不像教科书那样平滑完美。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'学习原则', title:'重视别人已摸索出的经验', point:'掌握前人精华，避免重复踩坑',
          content:'重视别人已摸索出的经验并掌握其精华。学习他人验证过的方法论，站在前人肩膀上。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'学习原则', title:'长远眼光看待发展', point:'不被紧迫性遮蔽长远视角',
          content:'许多当前紧迫的问题（找工作、找伴侣）不能因紧迫就遮蔽长远视角，要在长远眼光下审视更合理的选择。对感兴趣且有发展的领域（量化、游戏开发、写作），长期有价值，养成习惯从长期视角持续培养。把握当前主要矛盾，主要精力用来解决主要矛盾。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'学习原则', title:'分解问题，制定行动计划', point:'复杂问题拆为简单问题逐个解决',
          content:'将复杂问题拆解为一个个简单问题，制定行动计划去逐步解决。',
          cycle:'每周', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'学习原则', title:'沉淀高价值领域', point:'机会来临时要有能力把握',
          content:'对自己感兴趣且未来有发展机会的领域，沉淀工具和技能达到较高水平，机会来临时才能真正把握。例如量化数据开发，没有足够沉淀，机会到来也把握不住。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'学习原则', title:'刻意练习', point:'专家级水平是练出来的，而非天生',
          content:'通过专注、有目标、结构化的练习提高技能，比传统学习效率高200%。方法：明确具体可衡量目标（SMART）、保持专注、跳出舒适区、及时反馈修正、渐进式挑战、构建有效的心理表征。有目的练习四特点：明确目标、完全专注、有效反馈、走出舒适区。8小时法则：专注学习"如何学习"能快速掌握新技能。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        // ===== 理财原则 =====
        { id:uid(), cat:'理财原则', title:'长期价值投资', point:'长远眼光下审视，不做短视选择',
          content:'真正带来收益的可能只是10个投资中的某几个，选择有价值企业要在长远眼光下审视更合理的选择。警惕短期内能带来收益的投机策略，同样的概率也会带来损失。',
          cycle:'每季度', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'理财原则', title:'运气与风险是孪生兄弟', point:'因运气成功，也可能因风险失败',
          content:'那些因为运气的成功也可能转化为因为风险的失败。不要将运气当作能力，警惕短期运气带来的错误归因。',
          cycle:'每季度', status:'进行中', fav:false, created:'2026-08-15' },
        // ===== 思维模型 =====
        { id:uid(), cat:'思维模型', title:'艾森豪威尔矩阵', point:'优先重要，忽略纯紧急',
          content:'区分"重要"（影响长期目标）与"紧急"（需即时响应），将80%时间投入"重要非紧急"象限（技能提升、健康管理）。重要任务即使不马上出成果也真正至关重要。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'思维模型', title:'第一性原理', point:'剥离假设，回归基础要素重构',
          content:'剥离表象假设，回归基础要素重构解决方案（如马斯克拆解火箭成本，自研降低90%费用）。三步：识别现有假设 → 追溯根本要素 → 从零设计新路径。',
          cycle:'每季度', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'思维模型', title:'遗憾最小化框架', point:'想象80岁的自己，评估长期遗憾值',
          content:'决策者想象自己80岁，问多年后我会为采取或不采取此行动感到遗憾。这简化决策，集中考虑一个指标：遗憾。适用于职业转型、重大投资等不可逆决策。',
          cycle:'每季度', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'思维模型', title:'帕累托法则（二八法则）', point:'识别20%高杠杆行动',
          content:'20%的行动往往造就80%的结果。识别高杠杆行动（20%客户贡献80%利润），专注20%以尽量提高投入产出比。定期审计时间分配，削减低效活动。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'思维模型', title:'均值回归', point:'短期波动不代表趋势',
          content:'识别短期波动与长期趋势（经济周期、股价震荡），等待均值回归，避免过度反应。没有理由的变化只是偏差，不代表未来。',
          cycle:'每季度', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'思维模型', title:'汉隆剃刀', point:'能用愚蠢解释的，勿归因恶意',
          content:'看似恶意的行为更有可能是无能、愚蠢或疏忽的结果。不要恶意揣测别人，就能改进人际关系（团队冲突化解）。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'思维模型', title:'奥卡姆剃刀', point:'如无必要，勿增实体',
          content:'最简单、变量最少的解释最可能正确。不要选择最先浮上心头的解释（那更多关系到我们想看到或避免的东西）。',
          cycle:'每季度', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'思维模型', title:'墨菲定律', point:'凡可能出错必出错，预设防线',
          content:'凡是可能出错的事就一定会出错，确保一件事没有机会出错。不要得过且过，做好失效安全措施（重要数据三重备份）。',
          cycle:'每季度', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'思维模型', title:'避免待办事项清单', point:'列出"不做清单"，聚焦高价值',
          content:'避免待办清单的低效，反而列出"不做清单"（不刷社交媒体、不参加低效会议），缩小范围、排除无关紧要事务，聚焦高价值任务，减少决策疲劳。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'思维模型', title:'系统1与系统2思维', point:'重要决策前强制"冷却期"',
          content:'系统1（直觉/快速）易受偏见影响，系统2（分析/慢速）需主动调用以深度思考。重要决策前强制冷却期，书面列出利弊，承认系统1的存在并努力跳到系统2。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'思维模型', title:'达尔文式开放心态', point:'对相左论点给予同等重视',
          content:'孜孜不倦寻求真相。对与自己相左的论点和意见给予相同重视和关注，对自己的观点持批判和怀疑态度，彻底开放心态可撇开确认偏误和"自我"。每日记录一个被推翻的预设。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'思维模型', title:'40%-70%信息法则', point:'信息不足是赌博，过度是浪费时间',
          content:'科林·鲍威尔法则：信息掌握40%-70%时就应做决策。少于40%只是猜测，多于70%只是在浪费时间。鼓励在信息不全时快速做明智决策。',
          cycle:'每季度', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'思维模型', title:'可逆决策原则', point:'为可逆决策形成行动偏向',
          content:'大多数决策可逆，有些不可逆。假设所有决策都不可逆会犹豫不决。为可逆决策形成行动偏向——不会有什么损失，只会获取更多信息、加快速度。',
          cycle:'每季度', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'思维模型', title:'寻求"满意度"', point:'足够好，而非完美',
          content:'满意度=满意+足够，旨在做出足够好、充分、能实现目的的决策。与之对比，最大化者追求完美选择，而完美选择不存在，所以他们通常只会苦苦等待。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'思维模型', title:'相关性不等于因果', point:'区分近因和根本原因',
          content:'相关性与因果关系是截然不同的。牵强附会只让你找错问题。必须区分近因和根本原因——根本原因才是总要追溯的，需要问一系列问题。',
          cycle:'每季度', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'思维模型', title:'贝叶斯思维', point:'用概率把已发生事件纳入对未来结论',
          content:'根据概率把已发生的事件纳入考虑，以此对未来得出结论。只需三个元素的大致概率填入贝叶斯公式，就能得出比所谓专家更准确的结论——基本概率思维方式。',
          cycle:'每季度', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'思维模型', title:'同行评议与三角验证', point:'拿自己观点与他人对照',
          content:'用三角验证法，不断拿自己的观点与其他人的观点对照。闭门造车行不通——如果你缺乏第一手体验，你就不会真正理解。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'思维模型', title:'找出自己的缺陷', point:'假设自己是错的',
          content:'抵抗确认偏误，努力赶在其他人之前仔细审查自己。假设自己对冲突承担至少1%的责任，你自以为高人一等、绝无差错的幻觉就会破灭。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'思维模型', title:'史特金定律', point:'90%是垃圾，从10%精品出发',
          content:'任何事物90%都是垃圾。在决定投入时间和精力时精挑细选，从绝对不是垃圾的10%出发，缓慢往外拓展。',
          cycle:'每季度', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'思维模型', title:'帕金森定律', point:'琐事占时间，宽期限导致拖延',
          content:'鸡毛蒜皮的琐事容易占用时间，因为让人感觉做了有用的事。要明白真正优先目标，问自己是否朝目标方向。只要还有时间，工作就会扩展用完所有时间——应订立更紧迫的期限。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        // ===== 误判心理学 =====
        { id:uid(), cat:'误判心理学', title:'奖励/惩罚超级反应倾向', point:'"谁给我面包吃，我就给谁唱歌"',
          content:'生物倾向于重复有效的行为。祖母的规矩：先完成不喜欢但必要的任务，再奖励自己做喜欢的事。企业与员工存在奖励反应倾向——不好的激励机制会导致员工行为与企业目标不一致（国企人浮于事）。设计激励相容机制。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'误判心理学', title:'喜欢/热爱与讨厌/憎恨倾向', point:'爱恨都会扭曲事实',
          content:'喜欢/热爱倾向：忽略所爱对象的缺点，偏爱能联想起它的人事物，为爱扭曲事实。讨厌/憎恨倾向同理（忽略优点、为恨扭曲事实）。对二者保持清醒，防止认知偏差。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'误判心理学', title:'避免不一致性倾向', point:'防止习惯养成比改变它容易',
          content:'防止一种习惯的养成要比改变它容易得多。人们倾向于积累大量僵化结论和态度，即使有大量证据表明它们是错误的也不检查、不改变。正确的教育是提高认知能力，以便能够摧毁因拒绝改变而被保留的错误想法。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'误判心理学', title:'受简单联想影响的倾向', point:'谨慎审视以往每次成功',
          content:'谨慎地审视以往每次成功，找出其中的偶然因素，以免夸大新行动的成功概率。看看新行动会遇到哪些以往成功经验中没出现的危险因素。养成欢迎坏消息的习惯，避免"波斯信使综合征"。',
          cycle:'每季度', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'误判心理学', title:'简单的避免痛苦的心理否认', point:'现实太痛苦，人们扭曲事实',
          content:'现实太过痛苦令人无法承受，所以人们会扭曲各种事实直到它们变得可以承受。要识别这种自我欺骗，诚实面对现实。',
          cycle:'每季度', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'误判心理学', title:'被剥夺超级反应倾向', point:'失去10美元的痛苦大于得到10美元的快乐',
          content:'一个人从10美元中得到的快乐，并不正好等于失去10美元带来的痛苦。人对损失更敏感，这会导致非理性的风险规避或过度执着。投资与决策时要意识到这种不对称。',
          cycle:'每季度', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'误判心理学', title:'社会认同倾向', point:'人们倾向于跟随他人行为',
          content:'当不确定时，人们倾向于参考和模仿周围人的行为来做出判断。在群体压力下可能做出违背本心的选择。要警惕社会认同，尤其是"大多数人都在做"的诱惑，独立判断。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'误判心理学', title:'压力影响倾向', point:'轻度压力改善表现，重压导致失调',
          content:'轻度的压力能轻微改善人们的表现（如考试），而沉重的压力则会引发彻底失调。管理压力，避免在高压下做重大决定，学会用正念等工具调节。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'误判心理学', title:'错误衡量易得性倾向', point:'大脑容易满足于容易得到的东西',
          content:'人类大脑有限不完美，很容易满足于容易得到的东西（"如果我爱的女孩不在身边，我就爱身边的女孩"）。避免受易得性误导：按程序办事，用检查清单。即使已获得offer，也应对比其他机会，确定没有因易得性而产生错误认知。',
          cycle:'每月', status:'进行中', fav:false, created:'2026-08-15' },
        { id:uid(), cat:'误判心理学', title:'权威-错误影响倾向', point:'人类生活在等级分明的权力结构中',
          content:'人类大多生下来跟随领袖，社会被组织成等级分明的权力结构。权威影响倾向使人们过度信任权威人物的意见。要区分权威的真实专业领域，不盲目服从。',
          cycle:'每季度', status:'进行中', fav:false, created:'2026-08-15' }
      ],
      reviews: [
        { id:uid(), pid:null, title:'早睡早起', date:'2026-08-01', score:2, verdict:'部分坚持',
          practice:'本周有两天超过12点入睡，其余五天保持在23:30前。', reflect:'睡前刷手机是主要问题，需要把手机放到客厅充电。', goal:'减脂塑形' },
        { id:uid(), pid:null, title:'行动力：行动先于情绪', date:'2026-08-08', score:4, verdict:'坚持',
          practice:'两次想拖延任务时直接启动"只做5分钟"，都顺利进入状态完成。', reflect:'行动确实改变了情绪，印证了这个原则。', goal:'求职准备' },
        { id:uid(), pid:null, title:'保持头脑开放', date:'2026-07-16', score:5, verdict:'坚持',
          practice:'项目方案被同事指出漏洞，虚心听取后修改，方案明显更优。', reflect:'同事确实看到了我没看到的因果关系。', goal:'副业探索' }
      ],
      goals: [
        { id:uid(), name:'减脂塑形', cat:'减脂塑形', desc:'体脂率从 23% 降至 18%，体重 83kg 降至 76kg，保持规律运动习惯。', progress:15, due:'2026-12-31', status:'进行中', note:'重点目标：每周至少 3 次训练 + 控制饮食' },
        { id:uid(), name:'求职准备', cat:'求职准备', desc:'系统刷题 + 面试题整理 + 每日工作记录，拿到满意 offer。', progress:30, due:'2026-12-31', status:'进行中', note:'重点目标：LeetCode 每日 2 题 + 八股整理' },
        { id:uid(), name:'阅读笔记', cat:'阅读笔记', desc:'按书籍+主题分类做阅读笔记，每年精读 12 本书。', progress:40, due:'2026-12-31', status:'进行中', note:'正在读：《原则》《穷查理宝典》' },
        { id:uid(), name:'副业探索', cat:'副业探索', desc:'探索摄影、Godot 游戏开发、量化等副业方向，沉淀工具与技能。', progress:25, due:'2026-12-31', status:'进行中', note:'Build in Public：小红书摄影 + 游戏开发周更' }
      ],
      logs: [
        { id:uid(), date:'2026-08-13', pid:null, title:'行动力：行动先于情绪', scene:'晚上想刷手机逃避写量化复盘文档', act:'用"只做5分钟"启动，先打开文档写了第一段，结果一口气写完了。', reflect:'再次印证：启动成本是最大的阻力，行动会改变情绪。', score:4 },
        { id:uid(), date:'2026-08-14', pid:null, title:'保护深度工作时间', scene:'上午想先回邮件再写代码', act:'把邮件推迟到下午，上午 9:00-12:30 连续 3.5 小时写完了数据清洗模块。', reflect:'深度工作时间要像保护生命一样保护，回邮件这类琐事不该插进来。', score:4 },
        { id:uid(), date:'2026-08-15', pid:null, title:'保持头脑开放', scene:'同事对量化策略提出质疑', act:'没有立刻反驳，认真听完，发现他指出的回测过拟合问题确实存在，方案已调整。', reflect:'对方看到了我没看到的因果关系。保持开放是价值无限的。', score:5 }
      ]
    };
  }
  function ensure(db, seedVal){
    const d = db.principles = db.principles || {};
    d.principles = d.principles || [];
    d.reviews = d.reviews || [];
    d.goals = d.goals || [];
    d.logs = d.logs || [];
    // 原则种子合并：按标题去重，只把 seed 中"用户还没有"的原则补齐，
    // 绝不覆盖用户已有的（即使已修改/删除）。用 seedDataVersion 保证只合并一次。
    if(seedVal && Array.isArray(seedVal.principles)){
      const seedVer = seedVal.seedDataVersion || 0;
      if((d.seedDataVersion || 0) < seedVer){
        const hasTitle = new Set(d.principles.map(p => p.title));
        seedVal.principles.forEach(sp => {
          if(!hasTitle.has(sp.title)){ d.principles.push(sp); hasTitle.add(sp.title); }
        });
        d.seedDataVersion = seedVer;
      }
    }
  }

  /* ================= 工具 ================= */
  const P = () => DB.principles;
  function findP(id){ return P().principles.find(x => x.id === id); }
  function findPByTitle(t){ return P().principles.find(x => x.title === t); }
  function reviewsOf(idOrTitle){
    return P().reviews.filter(r => r.pid === idOrTitle || r.title === idOrTitle)
      .sort((a,b) => String(b.date).localeCompare(String(a.date)));
  }
  function lastReviewDate(p){
    const rs = reviewsOf(p.title);
    return rs.length ? rs[0].date : null;
  }
  function addDays(dateStr, days){
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    const m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
    return d.getFullYear() + '-' + m + '-' + dd;
  }
  function cycleDays(p){ return CYCLE_DAYS[p.cycle] || 30; }
  function nextDueDate(p){
    const last = lastReviewDate(p);
    return last ? addDays(last, cycleDays(p)) : null;
  }
  // 审视状态：due/today/soon/ok/none
  function dueStatus(p){
    const due = nextDueDate(p);
    if(!due) return { s:'none' };
    const today = dateStr();
    if(due < today) return { s:'due', due };
    if(due === today) return { s:'today', due };
    if(due <= addDays(today, 2)) return { s:'soon', due };
    return { s:'ok', due };
  }
  function dayDiff(dateStr2){
    const a = new Date(dateStr()+'T00:00:00'), b = new Date(dateStr2+'T00:00:00');
    return Math.round((b-a)/86400000);
  }
  function fmtDate(s){
    if(!s) return '';
    const parts = String(s).slice(0,10).split('-');
    return parts.length===3 ? parts[1]+'月'+parts[2]+'日' : String(s).slice(0,10);
  }
  function starHtml(n, size){
    let h = '';
    for(let i=1;i<=5;i++) h += '<span style="color:'+(i<=n?'#f59e0b':'#d1d5db')+'">★</span>';
    return h;
  }
  function catBadge(cat){
    const c = CAT_COLORS[cat] || '#6b7280';
    return '<span class="badge" style="background:'+c+'1a;color:'+c+';border:1px solid '+c+'44">'+esc(cat)+'</span>';
  }
  const verdictCls = v => v==='坚持'?'green':(v==='部分坚持'?'amber':'red');

  /* ================= 渲染：今天要处理 ================= */
  function renderDue(){
    const items = [];
    P().principles.forEach(p => {
      if(p.status === '已归档') return;
      const st = dueStatus(p);
      if(st.s === 'due' || st.s === 'today' || st.s === 'soon') items.push({ p, st });
    });
    items.sort((a,b) => ({due:0,today:1,soon:2}[a.st.s] - {due:0,today:1,soon:2}[b.st.s]));
    if(!items.length) return '';
    let h = '<div class="card pr-due"><div class="sec-title" style="margin-bottom:10px"><h2 style="color:var(--red)">⚠ 今天要处理</h2><div class="q-actions"><span class="badge red">'+items.length+'</span></div></div>';
    h += items.map(it => {
      const st = it.st, p = it.p;
      const tag = st.s==='due' ? '逾期'+dayDiff(st.due)+'天' : (st.s==='today' ? '今日应审视' : dayDiff(st.due)+'天后');
      const sub = st.s==='due' ? '本应 '+fmtDate(st.due)+' 审视，快补上' : (st.s==='today' ? '按周期今天该审视了' : '下次审视 '+fmtDate(st.due));
      return '<div class="pr-due-item '+(st.s==='due'?'pr-overdue':st.s==='today'?'pr-today':'pr-soon')+'">'+
        '<span class="badge '+(st.s==='due'?'red':st.s==='today'?'blue':'amber')+'">'+tag+'</span>'+
        '<div class="pr-due-main"><div class="pr-due-title">'+esc(p.title)+'</div>'+
        '<div class="muted">'+esc(sub)+' · '+esc(p.cat)+'</div></div>'+
        '<button class="btn primary sm" data-action="pr.review" data-pid="'+p.id+'">去审视</button></div>';
    }).join('');
    return h + '</div>';
  }

  /* ================= 渲染：原则库 ================= */
  function renderLib(){
    const st = state.pr;
    let h = '<div class="chips" style="margin-bottom:14px">' +
      ['全部'].concat(PCATS).map(c =>
        '<button class="chip '+(st.libCat===c?'active':'')+'" data-action="pr.libCat" data-v="'+c+'">'+c+
        (c==='全部' ? '（'+P().principles.length+'）' : '（'+P().principles.filter(p=>p.cat===c).length+'）')+'</button>').join('') + '</div>';

    const kw = (st.libKw||'').toLowerCase();
    let list = P().principles.filter(p => {
      if(st.libCat!=='全部' && p.cat!==st.libCat) return false;
      if(kw){ const hay = (p.title+' '+p.point+' '+p.content).toLowerCase(); if(hay.indexOf(kw)<0) return false; }
      return true;
    });
    if(st.libFav) list = list.filter(p => p.fav);

    if(!list.length){ h += '<div class="card"><div class="empty">'+(P().principles.length?'没有匹配的原则':'暂无原则，点击「新增原则」开始')+'</div></div>'; return h; }
    h += '<div class="pr-grid">' + list.map(p => {
      const s = dueStatus(p);
      const statusHtml = s.s==='due' ? '<span class="badge red">已逾期</span>'
        : s.s==='today' ? '<span class="badge blue">今日应审视</span>'
        : s.s==='soon' ? '<span class="badge amber">'+dayDiff(s.due)+'天后</span>'
        : s.s==='ok' ? '<span class="badge green">正常</span>'
        : '<span class="badge gray">未审视</span>';
      const rs = reviewsOf(p.title);
      const last = rs.length ? fmtDate(rs[0].date)+' 审视' : '';
      return '<div class="card pr-card" data-action="pr.detail" data-pid="'+p.id+'">'+
        '<div class="sec-title" style="margin-bottom:6px"><h2>'+esc(p.title)+'</h2>'+
        '<div class="q-actions">'+
        '<button class="icon-btn '+(p.fav?'pr-fav-on':'')+'" title="收藏" data-action="pr.fav" data-pid="'+p.id+'">'+(p.fav?'★':'☆')+'</button>'+
        '<button class="icon-btn" title="编辑" data-action="pr.edit" data-pid="'+p.id+'">✎</button>'+
        '<button class="icon-btn" title="删除" data-action="pr.del" data-pid="'+p.id+'">✕</button></div></div>'+
        '<div class="q-meta">'+catBadge(p.cat)+'<span class="badge gray">'+esc(p.cycle||'每月')+'审视</span></div>'+
        (p.point?'<div class="pr-point">'+esc(p.point)+'</div>':'')+
        '<div class="pr-foot"><span class="muted">'+last+'</span>'+statusHtml+'</div></div>';
    }).join('') + '</div>';
    return h;
  }

  /* ================= 渲染：审视历史 ================= */
  function renderReview(){
    const list = P().reviews.slice().sort((a,b) => String(b.date).localeCompare(String(a.date)));
    if(!list.length) return '<div class="card"><div class="empty">还没有审视记录，点击「手动审视」开始第一次反思</div></div>';
    let h = '';
    list.forEach(rv => {
      const v = rv.verdict;
      h += '<div class="card pr-rv-item" style="margin-bottom:12px"><div class="sec-title" style="margin-bottom:6px">'+
        '<h2>'+esc(rv.title||'未关联原则')+'</h2>'+
        '<div class="q-actions"><span class="badge '+(rv.goal?'indigo':'gray')+'">'+esc(rv.goal||'未关联')+'</span>'+
        '<span class="muted" style="font-size:12px">'+fmtDate(rv.date)+'</span>'+
        '<button class="icon-btn" title="删除" data-action="pr.delReview" data-id="'+rv.id+'">✕</button></div></div>'+
        '<div class="pr-rv-line"><span style="color:#f59e0b;font-size:13px">'+starHtml(rv.score)+'</span>'+
        '<span class="badge '+verdictCls(v)+'">'+esc(v)+'</span></div>'+
        (rv.practice?'<div class="pr-practice">'+esc(rv.practice)+'</div>':'')+
        (rv.reflect?'<div class="pr-reflect">反思：'+esc(rv.reflect)+'</div>':'')+'</div>';
    });
    return h;
  }

  /* ================= 渲染：原则日志 ================= */
  function renderLogs(){
    const kw = (state.pr.logKw||'').toLowerCase();
    let list = P().logs.slice().sort((a,b) => String(b.date).localeCompare(String(a.date)));
    if(kw) list = list.filter(l => (l.title+' '+l.scene+' '+l.act+' '+l.reflect).toLowerCase().indexOf(kw)>=0);
    if(!list.length) return '<div class="card"><div class="empty">'+(P().logs.length?'没有匹配的日志':'还没有日志，点击「记一条」记录今天应用了哪条原则')+'</div></div>';
    let h = '';
    list.forEach(l => {
      h += '<div class="card pr-log-item" style="margin-bottom:12px"><div class="sec-title" style="margin-bottom:6px">'+
        '<h2>'+esc(l.title||'未关联原则')+'</h2>'+
        '<div class="q-actions"><span class="badge blue">'+fmtDate(l.date)+'</span>'+
        '<button class="icon-btn" title="删除" data-action="pr.delLog" data-id="'+l.id+'">✕</button></div></div>'+
        (l.scene?'<div class="pr-scene"><b>场景：</b>'+esc(l.scene)+'</div>':'')+
        (l.act?'<div class="pr-act">'+esc(l.act)+'</div>':'')+
        '<div class="pr-foot"><span style="color:#f59e0b;font-size:12px">'+starHtml(l.score)+'</span>'+
        (l.reflect?'<span class="pr-reflect" style="flex:1">'+esc(l.reflect)+'</span>':'')+'</div></div>';
    });
    return h;
  }

  /* ================= 渲染：数据统计 ================= */
  function renderStats(){
    const total = P().principles.length;
    let reviewed = 0; P().principles.forEach(p => { if(lastReviewDate(p)) reviewed++; });
    let keepCount = 0; const rvCount = P().reviews.length;
    P().reviews.forEach(r => { if(r.verdict==='坚持') keepCount++; });
    const keepRate = rvCount ? Math.round(keepCount/rvCount*100) : 0;
    const dueCount = P().principles.filter(p => { const s=dueStatus(p); return s.s==='due'||s.s==='today'; }).length;

    let h = '<div class="val-summary-grid" style="margin-bottom:18px">'+
      '<div class="val-stat"><div class="vs-label">原则总数</div><div class="vs-value">'+total+'</div></div>'+
      '<div class="val-stat"><div class="vs-label">已审视原则</div><div class="vs-value" style="color:var(--green-dk)">'+reviewed+'</div></div>'+
      '<div class="val-stat"><div class="vs-label">待处理（逾期/今日）</div><div class="vs-value" style="color:var(--amber)">'+dueCount+'</div></div>'+
      '<div class="val-stat"><div class="vs-label">坚持率</div><div class="vs-value" style="color:var(--pink)">'+keepRate+'%</div></div>'+
      '</div>';

    // 目标进度
    h += '<div class="card" style="margin-bottom:16px"><div class="sec-title" style="margin-bottom:12px"><h2>🎯 个人目标进度</h2></div>';
    const goals = P().goals.filter(g => g.status!=='暂停').sort((a,b) => b.progress-a.progress);
    if(!goals.length) h += '<div class="empty">暂无目标</div>';
    else goals.forEach(g => {
      const c = GOAL_COLORS[g.cat] || '#2563eb';
      h += '<div class="pr-goal"><div class="pr-goal-nm">'+esc(g.name)+'</div>'+
        '<div class="pr-goal-bar"><div class="pr-goal-fill" style="width:'+g.progress+'%;background:linear-gradient(90deg,'+c+',#7c3aed)"></div></div>'+
        '<div class="pr-goal-pct">'+g.progress+'%</div></div>';
    });
    h += '</div>';

    // 分类分布（环形图 SVG）
    h += '<div class="card" style="margin-bottom:16px"><div class="sec-title" style="margin-bottom:12px"><h2>📊 分类分布</h2></div>';
    const catCounts = {};
    PCATS.forEach(c => catCounts[c] = 0);
    P().principles.forEach(p => { if(catCounts[p.cat]!==undefined) catCounts[p.cat]++; });
    const R=52, CX=70, CY=70, circ=2*Math.PI*R; let offset=0; const totalC = total||1;
    let pie = '<div class="pr-pie"><svg viewBox="0 0 140 140" style="width:140px;height:140px">';
    PCATS.forEach(c => {
      const n = catCounts[c]; if(!n) return;
      const frac = n/totalC, dash = frac*circ;
      pie += '<circle cx="'+CX+'" cy="'+CY+'" r="'+R+'" fill="none" stroke="'+(CAT_COLORS[c]||'#ccc')+'" stroke-width="16" stroke-dasharray="'+(dash-1.5)+' '+(circ-dash+1.5)+'" stroke-dashoffset="'+(-offset)+'" transform="rotate(-90 '+CX+' '+CY+')"></circle>';
      offset += dash;
    });
    pie += '<text x="70" y="66" text-anchor="middle" font-size="20" font-weight="800" fill="var(--ink)">'+total+'</text>'+
      '<text x="70" y="84" text-anchor="middle" font-size="11" fill="var(--ink2)">条原则</text></svg>';
    pie += '<div class="legend">' + PCATS.filter(c => catCounts[c]).map(c =>
      '<span class="legend-item"><span class="sw" style="background:'+CAT_COLORS[c]+'"></span>'+esc(c)+' '+catCounts[c]+'</span>').join('') + '</div></div>';
    h += pie + '</div>';

    // 评分趋势（最近12次）
    h += '<div class="card" style="margin-bottom:16px"><div class="sec-title" style="margin-bottom:12px"><h2>📈 审视评分趋势（最近12次）</h2></div>';
    const sorted = P().reviews.slice().sort((a,b) => String(a.date).localeCompare(String(b.date)));
    const last12 = sorted.slice(-12);
    h += last12.length < 2 ? '<div class="empty">至少需要 2 条审视记录才能生成趋势图</div>' : prTrendSvg(last12) + '</div>';

    // 审视次数排行
    h += '<div class="card"><div class="sec-title" style="margin-bottom:12px"><h2>🏆 审视次数排行 Top 10</h2></div>';
    const cnt = {};
    P().reviews.forEach(r => cnt[r.title] = (cnt[r.title]||0)+1);
    const rank = Object.keys(cnt).map(t => ({t, n:cnt[t]})).sort((a,b) => b.n-a.n).slice(0,10);
    const maxN = rank.length ? rank[0].n : 1;
    if(!rank.length) h += '<div class="empty">暂无审视数据</div>';
    else rank.forEach((it,i) => {
      h += '<div class="pr-rank"><span class="pr-rk">'+(i+1)+'</span><span class="pr-rank-nm">'+esc(it.t)+'</span>'+
        '<div class="pr-rank-bar-bg"><div class="pr-rank-bar" style="width:'+(it.n/maxN*100)+'%"></div></div><span class="pr-rank-v">'+it.n+'次</span></div>';
    });
    return h + '</div>';
  }
  function prTrendSvg(list){
    const W=520,H=150,padL=30,padB=24,padT=14;
    let xs=[],ys=[];
    for(let i=0;i<list.length;i++){ xs.push(padL+i*(W-padL-16)/(list.length-1)); ys.push(padT+(5-Number(list[i].score||3))/(5-1)*(H-padT-padB)); }
    let lines='';
    for(let g=1;g<=5;g++){ const gy=padT+(5-g)/(5-1)*(H-padT-padB); lines+='<line class="cgrid" x1="'+padL+'" y1="'+gy+'" x2="'+(W-16)+'" y2="'+gy+'" stroke-width="1"/><text x="'+(padL-6)+'" y="'+(gy+3)+'" text-anchor="end" font-size="10" fill="#8a93a3">'+g+'</text>'; }
    let poly=''; for(let i=0;i<xs.length;i++) poly+=(i?' L':'M')+xs[i].toFixed(1)+','+ys[i].toFixed(1);
    const area=poly+' L'+xs[xs.length-1].toFixed(1)+','+(H-padB)+' L'+xs[0].toFixed(1)+','+(H-padB)+' Z';
    let dots=''; for(let i=0;i<xs.length;i++) dots+='<circle cx="'+xs[i].toFixed(1)+'" cy="'+ys[i].toFixed(1)+'" r="3.4" fill="#5b64f2"/>';
    return '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;min-width:420px">'+
      '<defs><linearGradient id="prtg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5b64f2" stop-opacity=".22"/><stop offset="100%" stop-color="#5b64f2" stop-opacity="0"/></linearGradient></defs>'+
      lines+'<path d="'+area+'" fill="url(#prtg)"/><path d="'+poly+'" fill="none" stroke="#5b64f2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'+dots+'</svg>';
  }

  /* ================= 主渲染 ================= */
  function renderPrinciple(){
    const st = state.pr = state.pr || { tab:'lib', libCat:'全部', libKw:'', logKw:'', libFav:false };
    let h = header('📜 我的原则', '源于《原则》· 定期审视 · 发现真相',
      '<button class="btn ghost sm" data-action="pr.export" title="导出为 JSON，用于多端同步">⬇ 导出</button>' +
      '<button class="btn ghost sm" data-action="pr.import" title="从 JSON 导入原则数据">⬆ 导入</button>' +
      '<button class="btn primary" style="background:var(--indigo)" data-action="pr.add">＋ 新增原则</button>');

    h += renderDue();

    // Tab 导航
    const tabs = [ ['lib','📚 原则库'], ['review','🔄 定期审视'], ['logs','📝 原则日志'], ['stats','📊 数据统计'] ];
    h += '<div class="pr-tabs">' + tabs.map(t =>
      '<button class="pr-tab'+(st.tab===t[0]?' active':'')+'" data-action="pr.tab" data-v="'+t[0]+'">'+t[1]+'</button>').join('') + '</div>';

    if(st.tab === 'lib'){
      h += '<div class="pr-toolbar">'+
        '<input type="text" class="pr-search" placeholder="搜索原则标题 / 要点 / 内容" data-input="pr.libKw">'+
        '<button class="btn ghost sm'+(st.libFav?'':'')+'" data-action="pr.libFav" title="只看收藏">'+(st.libFav?'★ 收藏中':'☆ 只看收藏')+'</button></div>';
      h += renderLib();
    } else if(st.tab === 'review'){
      h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'+
        '<div class="muted">定期审视历史 · 诚实打分与反思</div>'+
        '<button class="btn primary sm" style="background:var(--indigo)" data-action="pr.review">＋ 手动审视</button></div>';
      h += renderReview();
    } else if(st.tab === 'logs'){
      h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'+
        '<div class="muted">每天应用哪条原则 · 见证行为改变</div>'+
        '<button class="btn primary sm" style="background:var(--indigo)" data-action="pr.addLog">＋ 记一条</button></div>'+
        '<div class="pr-toolbar" style="margin-bottom:12px"><input type="text" class="pr-search" placeholder="搜索日志（原则/场景/内容）" data-input="pr.logKw"></div>';
      h += renderLogs();
    } else {
      h += renderStats();
    }
    return h;
  }

  /* ================= 弹窗辅助 ================= */
  function catOptions(sel){ return PCATS.map(c => '<option'+(c===sel?' selected':'')+'>'+c+'</option>').join(''); }
  function cycleOptions(sel){ return CYCLES.map(c => '<option'+(c===sel?' selected':'')+'>'+c+'</option>').join(''); }
  function principleOptions(sel){
    return P().principles.filter(p => p.status!=='已归档').map(p => '<option value="'+esc(p.title)+'"'+(p.title===sel?' selected':'')+'>'+esc(p.title)+'</option>').join('');
  }
  function goalOptions(sel){
    return '<option value="">不关联目标</option>' + P().goals.filter(g => g.status!=='已完成').map(g => '<option value="'+esc(g.name)+'"'+(g.name===sel?' selected':'')+'>'+esc(g.name)+'（'+g.progress+'%）</option>').join('');
  }

  /* ================= 模块注册 ================= */
  Register.module({
    view: 'principles',
    nav: { ico:'📜', label:'我的原则', group:'长期积累' },
    seed: seed,
    ensure: ensure,
    render: renderPrinciple,
    actions: {
      'pr.tab': el => { state.pr.tab = el.dataset.v; render(); },
      'pr.libCat': el => { state.pr.libCat = el.dataset.v; render(); },
      'pr.libFav': () => { state.pr.libFav = !state.pr.libFav; render(); },
      'pr.add': () => {
        openModal('新增原则',
          '<div class="field"><label>分类</label><select name="cat">'+catOptions()+'</select></div>'+
          '<div class="field"><label>标题 <span style="color:var(--red)">*</span></label><input type="text" name="title" required placeholder="例如：保持头脑开放"></div>'+
          '<div class="field"><label>核心要点（一句话）</label><input type="text" name="point" placeholder="用一句话概括这条原则"></div>'+
          mdField('content', '详细内容', '', 6)+
          '<div class="quick-row"><div class="field" style="flex:1"><label>审视周期</label><select name="cycle">'+cycleOptions()+'</select></div>'+
          '<div class="field" style="flex:1"><label>状态</label><select name="status"><option>进行中</option><option>已归档</option></select></div></div>'+
          '<input type="hidden" name="id" value="">', 'pr.save');
      },
      'pr.edit': el => {
        const p = findP(el.dataset.pid); if(!p) return;
        openModal('编辑原则 · '+p.title,
          '<div class="field"><label>分类</label><select name="cat">'+catOptions(p.cat)+'</select></div>'+
          '<div class="field"><label>标题 <span style="color:var(--red)">*</span></label><input type="text" name="title" required value="'+esc(p.title)+'"></div>'+
          '<div class="field"><label>核心要点（一句话）</label><input type="text" name="point" value="'+esc(p.point||'')+'"></div>'+
          mdField('content', '详细内容', p.content, 6)+
          '<div class="quick-row"><div class="field" style="flex:1"><label>审视周期</label><select name="cycle">'+cycleOptions(p.cycle)+'</select></div>'+
          '<div class="field" style="flex:1"><label>状态</label><select name="status"><option'+(p.status==='进行中'?' selected':'')+'>进行中</option><option'+(p.status==='已归档'?' selected':'')+'>已归档</option></select></div></div>'+
          '<input type="hidden" name="id" value="'+p.id+'">', 'pr.save');
      },
      'pr.del': el => {
        const p = findP(el.dataset.pid); if(!p) return;
        if(confirm('删除原则「'+p.title+'」？其审视记录将保留。')){ P().principles = P().principles.filter(x => x.id !== p.id); save(); render(); }
      },
      'pr.fav': el => {
        const p = findP(el.dataset.pid); if(!p) return;
        p.fav = !p.fav; save(); render();
      },
      'pr.detail': el => {
        const p = findP(el.dataset.pid); if(!p) return;
        const rs = reviewsOf(p.title);
        const st = dueStatus(p);
        const stText = st.s==='due'?'已逾期，请审视':st.s==='today'?'今日应审视':st.s==='soon'?'下次审视 '+fmtDate(st.due):st.s==='ok'?'下次审视 '+fmtDate(st.due):'尚未审视';
        let rvHtml = rs.length ? '' : '<div class="muted" style="margin-top:6px">暂无审视记录</div>';
        rs.forEach(rv => {
          rvHtml += '<div class="pr-rv-mini"><div class="pr-rv-line"><span class="muted">'+fmtDate(rv.date)+'</span>'+
            '<span style="color:#f59e0b">'+starHtml(rv.score)+'</span><span class="badge '+verdictCls(rv.verdict)+'">'+esc(rv.verdict)+'</span></div>'+
            (rv.practice?'<div>'+esc(rv.practice)+'</div>':'')+
            (rv.reflect?'<div class="muted">'+esc(rv.reflect)+'</div>':'')+'</div>';
        });
        openModal(p.title,
          '<div class="q-meta" style="margin-bottom:10px">'+catBadge(p.cat)+'<span class="badge gray">'+esc(p.cycle||'每月')+'审视</span></div>'+
          '<div style="color:var(--red);font-weight:600;margin-bottom:12px">'+stText+'</div>'+
          (p.point?'<div class="field"><label>核心要点</label><div class="pr-point" style="font-weight:600">'+esc(p.point)+'</div></div>':'')+
          (p.content?'<div class="field"><label>详细内容</label><div class="md">'+md(p.content)+'</div></div>':'')+
          '<div class="field"><label>审视记录（'+rs.length+'）</label>'+rvHtml+'</div>'+
          '<input type="hidden" name="pid" value="'+p.id+'">', 'pr.review', null, true);
      },
      'pr.review': el => {
        // 从"今天要处理"或列表的按钮进入，或手动审视（无 pid）
        const pid = el && el.dataset && el.dataset.pid;
        openReviewModal(pid || '');
      },
      'pr.addLog': () => openLogModal(),
      'pr.delReview': el => {
        if(confirm('删除这条审视记录？')){ P().reviews = P().reviews.filter(x => x.id !== el.dataset.id); save(); render(); }
      },
      'pr.delLog': el => {
        if(confirm('删除这条原则日志？')){ P().logs = P().logs.filter(x => x.id !== el.dataset.id); save(); render(); }
      },
      'pr.export': () => {
        const data = JSON.stringify(P(), null, 2);
        const blob = new Blob([data], { type:'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'principles-data_' + dateStr() + '.json';
        a.click(); URL.revokeObjectURL(a.href);
      },
      'pr.import': () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = () => {
          const file = input.files && input.files[0];
          if(!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const obj = JSON.parse(reader.result);
              // 合并导入：原则/审视/目标/日志
              if(obj && typeof obj === 'object'){
                const target = DB.principles;
                if(Array.isArray(obj.principles)) target.principles = obj.principles;
                if(Array.isArray(obj.reviews)) target.reviews = obj.reviews;
                if(Array.isArray(obj.goals)) target.goals = obj.goals;
                if(Array.isArray(obj.logs)) target.logs = obj.logs;
                save(); render();
                alert('导入成功：原则 '+target.principles.length+' 条、审视 '+target.reviews.length+' 条、目标 '+target.goals.length+' 条、日志 '+target.logs.length+' 条');
              } else alert('文件格式不正确：缺少有效数据');
            } catch(e){ alert('解析失败：'+e.message); }
          };
          reader.readAsText(file, 'utf-8');
        };
        input.click();
      },
    },
    inputs: {
      'pr.libKw': el => { state.pr.libKw = el.value; render(); },
      'pr.logKw': el => { state.pr.logKw = el.value; render(); },
    },
    forms: {
      'pr.save': fd => {
        const id = fd.get('id');
        if(id){
          const p = findP(id); if(!p) return;
          Object.assign(p, { cat:fd.get('cat'), title:fd.get('title'), point:fd.get('point'), content:fd.get('content'), cycle:fd.get('cycle'), status:fd.get('status') });
        } else {
          P().principles.push({ id:uid(), cat:fd.get('cat'), title:fd.get('title'), point:fd.get('point'), content:fd.get('content'), cycle:fd.get('cycle'), status:fd.get('status'), fav:false, created:dateStr() });
        }
        save(); closeModal(); render();
      },
      'pr.reviewSave': fd => { submitReviewSave(fd); },
      'pr.logSave': fd => { submitLogSave(fd); },
    },
  });

  /* 审视弹窗 */
  function openReviewModal(pid){
    const p = pid ? findP(pid) : null;
    const title = p ? p.title : '';
    openModal('定期审视',
      '<div class="field"><label>选择原则</label><select name="title">'+principleOptions(title)+'</select></div>'+
      '<div class="field"><label>审视日期</label><input type="date" name="date" value="'+dateStr()+'"></div>'+
      '<div class="field"><label>坚持评分（1-5）</label><div class="pr-stars" id="rvStars">'+
        [1,2,3,4,5].map(n => '<button type="button" class="pr-star" data-n="'+n+'">★</button>').join('')+'</div></div>'+
      '<div class="field"><label>本次判定</label><div class="pr-verdicts" id="rvVerdicts">'+
        '<button type="button" class="pr-verdict pr-v-keep">坚持</button>'+
        '<button type="button" class="pr-verdict pr-v-part active">部分坚持</button>'+
        '<button type="button" class="pr-verdict pr-v-vio">违反</button></div></div>'+
      '<div class="field"><label>关联个人目标（可选）</label><select name="goal">'+goalOptions()+'</select>'+
      '<div class="muted" style="font-size:12px;margin-top:4px">关联后可同步更新该目标进度</div></div>'+
      '<div class="field" id="goalProgressFld" style="display:none"><label>目标进度同步（%）</label>'+
      '<input type="number" name="goalProgress" min="0" max="100" placeholder="例如 35"></div>'+
      mdField('practice', '践行情况（最近有没有做到？具体事例）', '', 3)+
      mdField('reflect', '反思 / 改进', '', 3)+
      '<input type="hidden" name="pid" value="'+ (p?p.id:'') +'">', 'pr.reviewSave', (root) => {
        // 星星
        root.querySelectorAll('#rvStars .pr-star').forEach(b => b.addEventListener('click', () => {
          root.querySelectorAll('#rvStars .pr-star').forEach(x => x.classList.toggle('on', Number(x.dataset.n) <= Number(b.dataset.n)));
          window._rvScore = Number(b.dataset.n);
        }));
        // 判定
        root.querySelectorAll('#rvVerdicts .pr-verdict').forEach(b => b.addEventListener('click', () => {
          root.querySelectorAll('#rvVerdicts .pr-verdict').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          window._rvVerdict = b.textContent;
        }));
        // 目标联动
        const goalSel = root.querySelector('select[name=goal]');
        goalSel.addEventListener('change', () => {
          root.querySelector('#goalProgressFld').style.display = goalSel.value ? 'block' : 'none';
          const g = P().goals.find(x => x.name === goalSel.value);
          if(g) root.querySelector('input[name=goalProgress]').value = g.progress;
        });
        window._rvScore = 3; window._rvVerdict = '部分坚持';
      });
  }
  function submitReviewSave(fd){
    const title = fd.get('title');
    if(!title){ alert('请选择原则'); return; }
    const p = findPByTitle(title);
    const goal = fd.get('goal');
    const rv = { id:uid(), pid: p ? p.id : null, title, date: fd.get('date')||dateStr(),
      score: window._rvScore||3, verdict: window._rvVerdict||'部分坚持',
      practice: fd.get('practice')||'', reflect: fd.get('reflect')||'', goal };
    P().reviews.push(rv);
    // 目标进度同步
    const gp = fd.get('goalProgress');
    if(goal && gp !== '' && gp != null){
      const g = P().goals.find(x => x.name === goal);
      if(g) g.progress = Math.max(0, Math.min(100, Number(gp)));
    }
    save(); closeModal(); render();
  }

  /* 日志弹窗 */
  function openLogModal(){
    openModal('记一条原则日志',
      '<div class="field"><label>日期</label><input type="date" name="date" value="'+dateStr()+'"></div>'+
      '<div class="field"><label>今天应用了哪条原则 <span style="color:var(--red)">*</span></label><select name="title">'+principleOptions()+'</select></div>'+
      '<div class="field"><label>场景（什么时候遇到的？）</label><input type="text" name="scene" placeholder="例如：下午想拖延写复盘文档"></div>'+
      mdField('act', '应用情况（具体做了什么？）', '', 3)+
      mdField('reflect', '反思 / 收获', '', 3)+
      '<div class="field"><label>自评（1-5）</label><div class="pr-stars" id="lgStars">'+
        [1,2,3,4,5].map(n => '<button type="button" class="pr-star" data-n="'+n+'">★</button>').join('')+'</div></div>',
      'pr.logSave', (root) => {
        root.querySelectorAll('#lgStars .pr-star').forEach(b => b.addEventListener('click', () => {
          root.querySelectorAll('#lgStars .pr-star').forEach(x => x.classList.toggle('on', Number(x.dataset.n) <= Number(b.dataset.n)));
          window._lgScore = Number(b.dataset.n);
        }));
        window._lgScore = 3;
      });
  }
  function submitLogSave(fd){
    const title = fd.get('title');
    if(!title){ alert('请选择关联原则'); return; }
    const p = findPByTitle(title);
    const lg = { id:uid(), date: fd.get('date')||dateStr(), pid: p ? p.id : null, title,
      scene: fd.get('scene')||'', act: fd.get('act')||'', reflect: fd.get('reflect')||'', score: window._lgScore||3 };
    P().logs.push(lg);
    save(); closeModal(); render();
  }
})();
