package com.vaultor.vaultor.repository;

import com.vaultor.vaultor.model.Setting;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SettingRepository extends JpaRepository<Setting, String> {
}
