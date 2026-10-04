package com.vaultor.vaultor.repository;
import com.vaultor.vaultor.model.TransferOperation;
import org.springframework.data.jpa.repository.JpaRepository;
public interface TransferOperationRepository extends JpaRepository<TransferOperation,String> { long countByStatusIn(java.util.Collection<String> statuses); }
