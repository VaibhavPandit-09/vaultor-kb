package com.vaultor.vaultor.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "settings")
@Data
@NoArgsConstructor
public class Setting {
    @Id
    @Column(name = "key_name")
    private String key;

    @Column(nullable = false)
    private String value;
    
    public Setting(String key, String value) {
        this.key = key;
        this.value = value;
    }
}
