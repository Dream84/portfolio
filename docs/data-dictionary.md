# 数据字典

| 对象 | 字段 | 含义 | 约束 |
| --- | --- | --- | --- |
| user | account_name | 登录账号名 | 3 至 32 位，唯一 |
| cash_account | currency | 币种 | CNY、USD、HKD、EUR、JPY |
| cash_account | fx_rate | 折算汇率 | 大于 0，外币必填 |
| trade | trade_type | 流水类型 | 八类枚举 |
| snapshot | cumulative_return | 累计收益率 | 快照唯一 |
