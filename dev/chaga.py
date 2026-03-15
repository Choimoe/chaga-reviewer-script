def compute_l1_distance_stats(a_list, p_list, m, k):
    """
    计算两个经验分布之间的 L1 距离及其不确定性指标。
    
    参数:
        a_list (list of float): 事件 B 的观测频率 (长度 n)
        p_list (list of float): 事件 A 的观测频率 (长度 n)
        m (int): B 的样本量
        k (int): A 的样本量
    
    返回:
        dict: 包含 D, SE, CI95 (tuple), RSE_percent
    """
    n = len(a_list)
    assert len(p_list) == n, "a_list 和 p_list 长度必须相同"
    assert m > 0 and k > 0, "样本量 m 和 k 必须为正整数"
    
    # 1. 计算 L1 距离 D
    D = sum(abs(a - p) for a, p in zip(a_list, p_list))
    
    # 2. 计算方差估计（Delta 方法）
    var_D = 0.0
    for a, p in zip(a_list, p_list):
        # 经验方差项：a(1-a)/m + p(1-p)/k
        term_b = a * (1 - a) / m if m > 0 else 0
        term_a = p * (1 - p) / k if k > 0 else 0
        var_D += term_b + term_a
    
    SE = math.sqrt(var_D)
    
    # 3. 95% 置信区间（正态近似）
    z_95 = 1.96
    ci_lower = max(0.0, D - z_95 * SE)  # 距离不能为负
    ci_upper = D + z_95 * SE
    
    # 4. 相对标准误差百分比
    if D > 0:
        RSE_percent = (SE / D) * 100
    else:
        # 当 D == 0 时，相对误差无定义；可返回 None 或用绝对 SE 表示
        RSE_percent = float('inf')  # 或设为 None，这里用 inf 表示“无限相对不确定”
    
    return {
        "D": D,
        "SE": SE,
        "CI95": (ci_lower, ci_upper),
        "RSE_percent": RSE_percent
    }